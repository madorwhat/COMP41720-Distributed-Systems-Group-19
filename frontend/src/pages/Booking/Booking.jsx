import { useAuth } from "../../auth/Auth.jsx";
import { api, BOOKING_URL } from "../../lib/api.js";
import "./Booking.css";
import "../Home/Dashboard.css";
import { useState, useEffect } from "react";

const COUNTRIES = ["Schengen", "UK", "Irish"];
const VISA_TYPES = ["Student", "Business", "Tourist"];
const STEPS = [["Your details", "Choose a free slot"], ["Review", "Check your details"], ["Confirmation", "Your booking"], ["Next steps", "Prepare for your appointment"]];

function slotText(day, slotTime) {
  const [from, to] = slotTime.split(" - ");
  const zone = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Dublin", timeZoneName: "shortOffset" })
    .formatToParts(new Date(`${day}T12:00:00Z`)).find((p) => p.type === "timeZoneName")?.value || "";
  return `${from} – ${to} ${zone === "GMT+0" ? "GMT" : zone}`.trim();
}

function irishNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).map(({ type, value }) => [type, value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
const irishToday = () => irishNow().date;

function notStarted(slot) {
  const now = irishNow();
  return slot.day > now.date || (slot.day === now.date && slot.slotTime.slice(0, 5) > now.time);
}

const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

function Row({ label, value }) {
  return <div className="booking-summary-row"><span>{label}</span><strong>{value}</strong></div>;
}

export default function Booking() {
  const { user } = useAuth();
  const [country, setCountry] = useState("");
  const [visaType, setVisaType] = useState("");
  const [day, setDay] = useState("");
  const [slots, setSlots] = useState(null);
  const [picked, setPicked] = useState(null);
  const [step, setStep] = useState("details");
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  const complete = Boolean(user.mobile && user.nationality);

  useEffect(() => {
    if (!country || !visaType) { setSlots(null); return; }
    let stale = false;
    const qs = new URLSearchParams({ country, visaType });
    if (day) qs.set("day", day);
    api(BOOKING_URL, `/api/v1/tpv/slots?${qs}`, { auth: false })
      .then((r) => { if (!stale) setSlots(r.data.filter(notStarted)); })
      .catch((err) => { if (!stale) { setSlots([]); setError(err.message); } });
    return () => { stale = true; };
  }, [country, visaType, day, reload]);

  const go = (next) => { setStep(next); window.scrollTo({ top: 0, behavior: "smooth" }); };

  function slotHasStarted() {
    setError("That slot has already started. Please pick another.");
    setPicked(null);
    setReload((n) => n + 1);
    go("details");
  }

  function review(e) {
    e.preventDefault();
    setError("");
    if (!picked) return setError("Please choose a time slot.");
    if (!notStarted(picked)) return slotHasStarted();
    go("review");
  }

  async function confirm() {
    setError("");
    if (!notStarted(picked)) return slotHasStarted();
    setBusy(true);
    try {
      const r = await api(BOOKING_URL, "/api/v1/bookings", { method: "POST", body: { bookingId: picked.bookingId } });
      setBooking({ ...r.appointment, slot: picked });
      go("confirmation");
    } catch (err) {
      if (err.code === "SLOT_UNAVAILABLE") {
        setError("Sorry, that slot was just taken. Please pick another.");
        setPicked(null);
        setReload((n) => n + 1);
        go("details");
      } else if (err.code === "SLOT_STARTED") {
        slotHasStarted();
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  function bookAnother() {
    setCountry(""); setVisaType(""); setDay(""); setPicked(null); setBooking(null); setError("");
    go("details");
  }

  const current = step === "details" ? 0 : step === "review" ? 1 : 2;

  return (
    <div className="booking-page">
      <main className="booking-wrap" id="main" tabIndex={-1}>
        <a href="#/home" className="booking-back-link"><span aria-hidden="true">←</span> Back to Home</a>

        <header className="booking-head">
          <div className="booking-eyebrow"><span className="booking-eyebrow-dot" />VISA APPOINTMENT PLANNER</div>
          <h1>Your journey starts<br /><span>with a booking.</span></h1>
          <p>Choose your country and visa type, pick a free slot, and confirm your appointment in a few steps.</p>
        </header>

        {step === "confirmation" && booking ? (
          <section className="booking-confirmation" aria-live="polite">
            <div className="booking-success-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <span className="booking-confirmation-kicker">BOOKING COMPLETE</span>
            <h2>Appointment confirmed!</h2>
            <p className="booking-confirmation-description">Nice work, {user.fullName}. Your appointment has been booked.</p>
            <div className="booking-reference"><span>YOUR BOOKING REFERENCE</span><strong>{booking.appointmentId.slice(0, 8).toUpperCase()}</strong></div>
            <div className="booking-summary">
              <Row label="Name" value={user.fullName} />
              <Row label="Email" value={user.email} />
              <Row label="Country" value={booking.slot.country} />
              <Row label="Visa type" value={booking.slot.visaType} />
              <Row label="Appointment date" value={fmtDay(booking.slot.day)} />
              <Row label="Appointment time" value={slotText(booking.slot.day, booking.slot.slotTime)} />
            </div>
            <div className="booking-demo-warning">
              <strong>Your booking is saved.</strong>
              <p>You can see it any time on your Home page and under "My bookings" on your profile page.</p>
              <a href="#/profile">View my bookings →</a>
            </div>
            <button type="button" className="booking-submit" onClick={bookAnother}>Book another appointment <span aria-hidden="true">→</span></button>
            <a href="#/home" className="booking-home-link">Return to home</a>
          </section>
        ) : (
          <>
            <div className="booking-steps" aria-label="Booking process">
              {STEPS.map(([title, hint], i) => (
                <div key={title} style={{ display: "contents" }}>
                  {i > 0 && <div className="booking-step-line" />}
                  <div className={`booking-step${i <= current ? " booking-step-active" : ""}`}>
                    <span>{i + 1}</span><div><strong>{title}</strong><small>{hint}</small></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="booking-grid">
              <aside className="booking-aside">
                <div className="booking-aside-number">BEFORE YOU BEGIN</div>
                <h2>A smoother visa journey starts here.</h2>
                <p className="booking-aside-description">Slots are limited and each one can be booked by only one person.</p>
                <ul className="booking-preparation-list">
                  {["Add your mobile number and nationality on your profile", "Choose your country and visa category", "Pick a free date and time", "Review and confirm your booking"].map((t) => (
                    <li key={t}><span className="booking-tick">✓</span><span>{t}</span></li>
                  ))}
                </ul>
              </aside>

              <section className="booking-panel">
                {!complete ? (
                  <>
                    <div className="booking-panel-heading"><div><span className="booking-panel-kicker">ALMOST THERE</span><h2>Complete your profile</h2><p>Your mobile number and nationality are required before you can book.</p></div></div>
                    <div className="booking-panel-divider" />
                    <a className="booking-submit" href="#/profile">Go to my profile <span aria-hidden="true">→</span></a>
                  </>
                ) : step === "review" ? (
                  <>
                    <div className="booking-panel-heading"><div><span className="booking-panel-kicker">REVIEW</span><h2>Check your booking</h2><p>Confirm to reserve this slot.</p></div></div>
                    <div className="booking-panel-divider" />
                    <div className="booking-summary">
                      <Row label="Country" value={picked.country} />
                      <Row label="Visa type" value={picked.visaType} />
                      <Row label="Date" value={fmtDay(picked.day)} />
                      <Row label="Time" value={slotText(picked.day, picked.slotTime)} />
                    </div>
                    {error && <p className="booking-error" role="alert">{error}</p>}
                    <div className="booking-form">
                      <button type="button" className="booking-submit" onClick={confirm} disabled={busy}>{busy ? "Booking…" : "Confirm appointment"}<span aria-hidden="true">→</span></button>
                      <button type="button" className="slot-btn" style={{ gridColumn: "1 / -1" }} onClick={() => go("details")}>← Change slot</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="booking-panel-heading"><div><span className="booking-panel-kicker">APPOINTMENT FORM</span><h2>Book your appointment</h2><p>Fields marked * are required. Appointment times are in Dublin time (GMT, or GMT+1 in summer). A slot can be booked until it starts.</p></div></div>
                    <div className="booking-panel-divider" />
                    <form className="booking-form" onSubmit={review}>
                      <div className="booking-field">
                        <label htmlFor="country">Destination country <span>*</span></label>
                        <select id="country" value={country} required onChange={(e) => { setCountry(e.target.value); setPicked(null); }}>
                          <option value="">Select country</option>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="booking-field">
                        <label htmlFor="visaType">Type of visa <span>*</span></label>
                        <select id="visaType" value={visaType} required onChange={(e) => { setVisaType(e.target.value); setPicked(null); }}>
                          <option value="">Select visa type</option>{VISA_TYPES.map((t) => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="booking-field booking-field-full">
                        <label htmlFor="day">Preferred date (optional)</label>
                        <input id="day" type="date" min={irishToday()} value={day} onChange={(e) => { setDay(e.target.value); setPicked(null); }} />
                        <small>Leave empty to see every free date.</small>
                      </div>

                      {slots && (slots.length === 0
                        ? <p className="dash-muted" style={{ gridColumn: "1 / -1" }}>No free slots for this choice.</p>
                        : (
                          <div className="slot-grid" role="group" aria-label="Free slots">
                            {slots.map((s) => (
                              <button type="button" key={s.bookingId} className="slot-btn" aria-pressed={picked?.bookingId === s.bookingId} onClick={() => setPicked(s)}>
                                <strong>{slotText(s.day, s.slotTime)}</strong><small>{fmtDay(s.day)}</small>
                              </button>
                            ))}
                          </div>
                        ))}

                      {error && <p className="booking-error" role="alert">{error}</p>}
                      <button className="booking-submit" type="submit">Continue <span aria-hidden="true">→</span></button>
                    </form>
                  </>
                )}
              </section>
            </div>
          </>
        )}

        <footer className="booking-footer"><span>Book My Visa</span><span>Plan carefully. Apply confidently.</span></footer>
      </main>
    </div>
  );
}