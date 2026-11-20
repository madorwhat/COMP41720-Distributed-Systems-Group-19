// An admin opened new slots: tell the people who subscribed to that country and visa type.
const { Op, QueryTypes } = require('sequelize');
const config = require('../config');
const { sequelize, SlotAlert } = require('../db');
const { sendSlotsOpened } = require('../mailer');

// Tells one person that new appointments are open. Same pattern as the other emails: save the
// row, lock it, check the "already told" tick, send, set the tick. Returns 'sent', 'duplicate'
// (this message already reached them) or 'cooldown' (they were told about this country and visa
// type recently, so we don't email them again yet).
async function alertOne(event, recipient, cooldownStart) {
  const { eventId, country, visaType } = event;
  const { userEmail } = recipient;
  await SlotAlert.bulkCreate([{ eventId, userEmail, country, visaType }], {
    ignoreDuplicates: true,
  });

  return sequelize.transaction(async (transaction) => {
    // Several SlotsOpened messages are handled at the same time (an approved plan sends one per
    // slot). This lock makes them take turns per person and choice, so the "told recently" check
    // below sees the email the other one just sent, and nobody gets the same alert twice.
    await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
      replacements: { key: `${userEmail}|${country}|${visaType}` },
      transaction,
    });
    const alert = await SlotAlert.findOne({
      where: { eventId, userEmail },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (alert.sentAt) return 'duplicate';

    const recentlyTold = await SlotAlert.findOne({
      where: { userEmail, country, visaType, sentAt: { [Op.gt]: cooldownStart } },
      transaction,
    });
    if (recentlyTold) return 'cooldown';

    await sendSlotsOpened(recipient, event);
    await alert.update({ sentAt: new Date() }, { transaction });
    return 'sent';
  });
}

// We email the people who subscribed to exactly that country and visa type (see
// routes/subscriptions.js), and nobody else. Booking doesn't send a list of people, and we have no
// list of all users (Auth owns that), so "who wants to know" is what each person told us.
// Returns 'sent' if at least one email went out, otherwise 'skipped'.
//
// One email failing does not stop the others. If any failed, we throw at the end so the whole
// message goes to the retry queue; on the retry, the people who were already told are skipped.
async function handleSlotsOpened(event, now = new Date()) {
  const recipients = await sequelize.query(
    `SELECT user_email AS "userEmail", user_name AS "userName"
       FROM slot_subscriptions
      WHERE country = :country AND visa_type = :visaType`,
    {
      replacements: { country: event.country, visaType: event.visaType },
      type: QueryTypes.SELECT,
    },
  );

  const cooldownStart = new Date(now.getTime() - config.slotAlertCooldownHours * 3_600_000);
  const counts = { sent: 0, duplicate: 0, cooldown: 0 };
  const failures = [];
  for (const recipient of recipients) {
    try {
      counts[await alertOne(event, recipient, cooldownStart)] += 1;
    } catch (err) {
      failures.push(`${recipient.userEmail}: ${err.message}`);
    }
  }

  console.log(
    `Slots opened (${event.country} ${event.visaType}, ${event.day}): ` +
      `${recipients.length} subscribed, ${counts.sent} emailed, ${counts.cooldown} told recently, ` +
      `${counts.duplicate} already told, ${failures.length} failed`,
  );
  if (failures.length) {
    throw new Error(`${failures.length} email(s) failed, first: ${failures[0]}`);
  }
  return counts.sent > 0 ? 'sent' : 'skipped';
}

module.exports = { handleSlotsOpened };
