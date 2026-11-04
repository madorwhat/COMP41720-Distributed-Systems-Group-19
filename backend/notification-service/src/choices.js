// The countries and visa types we know about. They live in one place so that the messages from
// Booking and the subscription routes can never disagree about what a valid choice is.
const { z } = require('zod');

const country = z.enum(['Schengen', 'UK', 'Irish']);
const visaType = z.enum(['Student', 'Business', 'Tourist']);

module.exports = { country, visaType };
