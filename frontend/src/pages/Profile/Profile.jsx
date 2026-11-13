import { useAuth } from "../../auth/Auth.jsx";
import { api, BOOKING_URL,NOTIFICATION_URL } from "../../lib/api.js";  
import "../Booking/Booking.css";
import "../Home/Dashboard.css";
import { useState, useEffect,useCallback } from "react";

const COUNTRIES = ["Schengen", "UK", "Irish"];
const VISA_TYPES = ["Student", "Business", "Tourist"];
const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const small = { padding: "6px 12px" };

function slotText(day, slotTime) {
  const [from, to] = slotTime.split(" - ");
  const zone = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Dublin", timeZoneName: "shortOffset" })
    .formatToParts(new Date(`${day}T12:00:00Z`)).find((p) => p.type === "timeZoneName")?.value || "";
  return `${from} – ${to} ${zone === "GMT+0" ? "GMT" : zone}`.trim();
}

function Msg({ msg }) {
  return <>{msg.err && <p className="booking-error" role="alert">{msg.err}</p>}{msg.ok && <p className="dash-ok" role="status">{msg.ok}</p>}</>;
}

function Preferences() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [country, setCountry] = useState("");
  const [visaType, setVisaType] = useState("");
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState("");

  const load = useCallback(
    () => api(NOTIFICATION_URL, "/subscriptions")
      .then((r) => { setItems(r.data); setLoadError(""); })
      .catch((err) => setLoadError(err.message)),
    [],
  );
  useEffect(() => { load(); }, [load]);

  const has = (c, v) => (items || []).some((x) => x.country === c && x.visaType === v);

  async function add(e) {
    e.preventDefault();
    if (has(country, visaType)) return setMsg({ ok: `You already get alerts for ${country} ${visaType}.` });
    setMsg({}); setBusy("add");
    try {
      await api(NOTIFICATION_URL, `/subscriptions/${country}/${visaType}`, { method: "PUT" });
      setMsg({ ok: `Saved. We will email ${user.email} when new ${country} ${visaType} appointments open.` });
      setCountry(""); setVisaType("");
      await load();
    } catch (err) { setMsg({ err: err.message }); } finally { setBusy(""); }
  }

  async function remove(item) {
    const key = `${item.country}/${item.visaType}`;
    setMsg({}); setBusy(key);
    try {
      await api(NOTIFICATION_URL, `/subscriptions/${key}`, { method: "DELETE" });
      setItems((list) => list.filter((x) => !(x.country === item.country && x.visaType === item.visaType)));
    } catch (err) { setMsg({ err: err.message }); } finally { setBusy(""); }
  }

  return (
    <section className="profile-card" style={{ marginTop: 24 }}>
      <div className="profile-card-heading"><div><h2>Preferences</h2><p>Get an email when new appointments open for the place and visa you want</p></div></div>

      <form className="booking-form" onSubmit={add}>
        <div className="booking-field">
          <label htmlFor="prefCountry">Country <span>*</span></label>
          <select id="prefCountry" value={country} required onChange={(e) => setCountry(e.target.value)}>
            <option value="">Select country</option>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="booking-field">
          <label htmlFor="prefVisa">Visa type <span>*</span></label>
          <select id="prefVisa" value={visaType} required onChange={(e) => setVisaType(e.target.value)}>
            <option value="">Select visa type</option>{VISA_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        <Msg msg={msg} />
        <button className="booking-submit" disabled={busy === "add"}>{busy === "add" ? "Saving…" : "Notify me"}</button>
      </form>

      <div className="booking-form-disclaimer">
        <p>
          We'll email you when an admin adds appointments matching this exact country and visa type.
          You'll receive at most one email per day for each choice. All appointment times are shown
          in Dublin time. You can subscribe to multiple choices.
        </p>
      </div>

      <div className="dash-section">
        <h3>Your alerts</h3>
        {loadError ? <p className="booking-error">{loadError}</p>
          : items === null ? <p className="dash-muted">Loading…</p>
          : items.length === 0 ? <p className="dash-muted">You are not following any choice yet.</p>
          : (
            <ul className="dash-list">
              {items.map((x) => {
                const key = `${x.country}/${x.visaType}`;
                return (
                  <li key={key}>
                    <span><strong>{x.country} · {x.visaType}</strong><br /><span className="dash-muted">Email when new appointments open</span></span>
                    <button type="button" className="slot-btn" style={small} disabled={busy === key} onClick={() => remove(x)}>
                      {busy === key ? "Removing…" : "Remove"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
      </div>
    </section>
  );
}

function ProfileExtras() {
  const { user, updateProfile } = useAuth();
  const [bookings, setBookings] = useState(null);
  const [bookingsError, setBookingsError] = useState("");
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(BOOKING_URL, "/api/v1/bookings/my-slots").then((r) => setBookings(r.data)).catch((e) => setBookingsError(e.message));
  }, []);

  async function save(e) {
    e.preventDefault();
    setMsg({}); setBusy(true);
    const f = new FormData(e.currentTarget);
    try { await updateProfile(String(f.get("mobile")).trim(), String(f.get("nationality")).trim()); setMsg({ ok: "Details saved." }); }
    catch (err) { setMsg({ err: err.message }); } finally { setBusy(false); }
  }

  return (
    <>
      <section className="profile-card" style={{ marginTop: 24 }}>
        <div className="profile-card-heading"><div><h2>Contact details</h2><p>Mobile number and nationality are required before you can book.</p></div></div>
        <form className="booking-form" onSubmit={save}>
          <div className="booking-field"><label htmlFor="mobile">Mobile number <span>*</span></label><input id="mobile" name="mobile" defaultValue={user.mobile || ""} required placeholder="+353 87 123 4567" /></div>
          <div className="booking-field"><label htmlFor="nationality">Nationality <span>*</span></label><input id="nationality" name="nationality" defaultValue={user.nationality || ""} required maxLength={60} /></div>
          <Msg msg={msg} />
          <button className="booking-submit" disabled={busy}>{busy ? "Saving…" : "Save details"}</button>
        </form>
      </section>

      <Preferences />

      <section className="profile-card" style={{ marginTop: 24 }}>
        <div className="profile-card-heading"><div><h2>My bookings</h2><p>Your confirmed appointments</p></div></div>
        {bookingsError ? <p className="booking-error">{bookingsError}</p>
          : bookings === null ? <p className="dash-muted">Loading…</p>
          : bookings.length === 0 ? <p className="dash-muted">No bookings yet. <a href="#/booking">Plan an appointment</a>.</p>
          : (
            <ul className="dash-list">
              {bookings.map((a) => (
                <li key={a.appointmentId}>
                  <span><strong>{a.slot.country} · {a.slot.visaType}</strong><br /><span className="dash-muted">{fmtDay(a.slot.day)}, {slotText(a.slot.day, a.slot.slotTime)}</span></span>
                  <span className="dash-muted">Ref {a.appointmentId.slice(0, 8).toUpperCase()}</span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const username = user?.fullName || "User";
  const initials = username
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="profile-page">
      <div className="profile-container">
        <a href="#/home" className="profile-back">
          <span aria-hidden="true">←</span> Back to Home
        </a>

        <section className="profile-hero">
          <div className="profile-avatar-large" aria-hidden="true">
            {initials}
          </div>

          <div className="profile-hero-copy">
            <span className="profile-eyebrow">MY ACCOUNT</span>
            <h1>Welcome, {username}!</h1>
            <p>Manage your account and keep your visa journey organised.</p>
          </div>

          <span className="profile-status">
            <span /> Account active
          </span>
        </section>

        <div className={`profile-content-grid ${isAdmin ? "profile-content-grid-admin" : ""}`}>
          <section className="profile-card">
            <div className="profile-card-heading">
              <div className="profile-card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
                </svg>
              </div>
              <div>
                <h2>Personal information</h2>
                <p>Your account details</p>
              </div>
            </div>
            <div className="profile-info-row">
              <span>Name</span>
              <strong>{username}</strong>
            </div>

            <div className="profile-info-row">
              <span>Email</span>
              <strong>{user?.email}</strong>
            </div>

            <div className="profile-info-row">
              <span>Account status</span>
              <strong className="profile-active-text">Active</strong>
            </div>
          </section>

          {!isAdmin && (
            <section className="profile-card profile-actions-card">
              <div className="profile-card-heading">
                <div className="profile-card-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="16" rx="3" />
                    <path d="M16 3v4M8 3v4M3 10h18" />
                  </svg>
                </div>
                <div>
                  <h2>Your visa journey</h2>
                  <p>Quick links to get started</p>
                </div>
              </div>

              <a href="#/booking" className="profile-action-link">
                <span className="profile-action-symbol" aria-hidden="true">+</span>
                <span>
                  <strong>Plan an appointment</strong>
                  <small>Enter your trip and visa details</small>
                </span>
                <span className="profile-action-arrow" aria-hidden="true">→</span>
              </a>

              <a href="#/home" className="profile-action-link">
                <span className="profile-action-symbol" aria-hidden="true">⌂</span>
                <span>
                  <strong>Go to dashboard</strong>
                  <small>Return to your home page</small>
                </span>
                <span className="profile-action-arrow" aria-hidden="true">→</span>
              </a>
            </section>
          )}
        </div>

        {!isAdmin && <ProfileExtras />}

        {!isAdmin && (
          <section className="profile-help-card">
            <div>
              <h2>Ready for your next trip?</h2>
            </div>
            <a href="#/booking" className="profile-primary-button">
              Start planning <span aria-hidden="true">→</span>
            </a>
          </section>
        )}

        <p className="profile-footer-note">
          Book My Visa <span>·</span> Your journey, made clearer
        </p>
      </div>
    </main>
  );
}