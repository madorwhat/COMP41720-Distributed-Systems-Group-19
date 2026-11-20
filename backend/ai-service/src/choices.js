// The countries and visa types Booking accepts, and the shape of new slots.
const COUNTRIES = ['Schengen', 'UK', 'Irish'];
const VISA_TYPES = ['Student', 'Business', 'Tourist'];
const MAX_SLOTS = 40; // per country and visa type, per plan
// New slots go on weekdays, 09:00–12:00 Dublin time, 30 minutes each (6 a day).
const TIMES = ['09:00 - 09:30', '09:30 - 10:00', '10:00 - 10:30', '10:30 - 11:00', '11:00 - 11:30', '11:30 - 12:00'];

module.exports = { COUNTRIES, VISA_TYPES, MAX_SLOTS, TIMES };
