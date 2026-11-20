import { useAuth } from "../../auth/Auth.jsx";
import { api, AUTH_URL, BOOKING_URL, AI_URL } from "../../lib/api.js";
import Icon from "../../components/Icons.jsx";
import "./Home.css";
import "../Booking/Booking.css";
import "./Dashboard.css";
import { useState, useEffect } from "react";

const OFFICIAL_GUIDANCE =
  "https://home-affairs.ec.europa.eu/policies/schengen-borders-and-visa/visa-policy_en";

const LIMIT = 10;
const COUNTRIES = ["Schengen", "UK", "Irish"];
const VISA_TYPES = ["Student", "Business", "Tourist"];

const ACTIONS = {
  USER_SIGNUP: "Signed up",
  ADMIN_LOGIN: "Admin logged in",
  USER_DISABLED: "Account disabled",
  USER_ENABLED: "Account enabled",
  USER_ROLE_CHANGED: "Role changed",
};

const displayNameOf = (user) =>
  user?.fullName || user?.email?.split("@")[0] || "";

const fmtDay = (day) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const when = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const smallButtonStyle = { padding: "6px 12px" };


const irishClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Dublin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function dublinClock(instant) {
  const parts = Object.fromEntries(
    irishClock
      .formatToParts(instant)
      .map(({ type, value }) => [type, value])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

const asUtc = (date, time) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  return Date.UTC(year, month - 1, day, hour, minute);
};

function irishInstant(day, time) {
  const wanted = asUtc(day, time);
  let guess = wanted;

  for (let i = 0; i < 2; i++) {
    const current = dublinClock(new Date(guess));
    guess += wanted - asUtc(current.date, current.time);
  }

  return new Date(guess);
}

function daysUntil(day, now = new Date()) {
  return Math.round(
    (asUtc(day, "00:00") -
      asUtc(dublinClock(now).date, "00:00")) /
      86400000
  );
}

function yourTime(day, slotTime) {
  const [from, to] = slotTime.split(" - ");
  const start = irishInstant(day, from);
  const end = irishInstant(day, to);

  const formatTime = (date) =>
    date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });

  const sameDay = start.toLocaleDateString("en-CA") === day;

  if (formatTime(start) === from && sameDay) {
    return "";
  }

  return `${start.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  })}, ${formatTime(start)} - ${formatTime(end)}`;
}

function slotText(day, slotTime) {
  const [from, to] = slotTime.split(" - ");

  const zone =
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Dublin",
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date(`${day}T12:00:00Z`))
      .find((part) => part.type === "timeZoneName")?.value || "";

  return `${from} – ${to} ${zone === "GMT+0" ? "GMT" : zone}`.trim();
}

function times(appointment) {
  const [from, to] = appointment.slot.slotTime.split(" - ");

  return {
    start: irishInstant(appointment.slot.day, from),
    end: irishInstant(appointment.slot.day, to),
  };
}

function phaseOf(appointment, now) {
  const { start, end } = times(appointment);

  if (now >= end) {
    return { phase: "past", text: "Time has passed" };
  }

  if (now >= start) {
    return { phase: "now", text: "Happening now" };
  }

  const days = daysUntil(appointment.slot.day, now);
  const at = appointment.slot.slotTime.split(" - ")[0];

  if (days === 0) {
    return { phase: "upcoming", text: `Today at ${at}` };
  }

  if (days === 1) {
    return { phase: "upcoming", text: `Tomorrow at ${at}` };
  }

  return { phase: "upcoming", text: `In ${days} days` };
}

const utc = (date) =>
  date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function downloadIcs(appointment) {
  const { start, end } = times(appointment);

  const escapeIcs = (value) =>
    String(value).replace(/[\\;,]/g, (match) => `\\${match}`);

  const reference = appointment.appointmentId.slice(0, 8).toUpperCase();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Book My Visa//EN",
    "BEGIN:VEVENT",
    `UID:${appointment.appointmentId}@bookmyvisa`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(start)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${escapeIcs(
      `Visa appointment: ${appointment.slot.country} (${appointment.slot.visaType})`
    )}`,
    `DESCRIPTION:${escapeIcs(
      `Booking reference ${reference}. Times are Dublin time.`
    )}`,
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Visa appointment tomorrow",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const url = URL.createObjectURL(
    new Blob([lines.join("\r\n")], {
      type: "text/calendar;charset=utf-8",
    })
  );

  const link = document.createElement("a");
  link.href = url;
  link.download = `visa-appointment-${appointment.slot.day}.ics`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function calendarLinks(appointment) {
  const { start, end } = times(appointment);

  const title = `Visa appointment: ${appointment.slot.country} (${appointment.slot.visaType})`;
  const note = `Booking reference ${appointment.appointmentId
    .slice(0, 8)
    .toUpperCase()}. Times are Dublin time.`;

  const iso = (date) => date.toISOString().replace(/\.\d{3}/, "");

  const query = (params) =>
    Object.entries(params)
      .map(
        ([key, value]) =>
          `${key}=${encodeURIComponent(value).replaceAll("%2F", "/")}`
      )
      .join("&");

  return {
    google: `https://calendar.google.com/calendar/render?${query({
      action: "TEMPLATE",
      text: title,
      details: note,
      dates: `${utc(start)}/${utc(end)}`,
    })}`,

    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?${query({
      path: "/calendar/action/compose",
      rru: "addevent",
      subject: title,
      body: note,
      startdt: iso(start),
      enddt: iso(end),
    })}`,
  };
}

function CalendarButton({ a }) {
  const [open, setOpen] = useState(false);
  const { google, outlook } = calendarLinks(a);
  const close = () => setOpen(false);

  return (
    <details
      className="appt-menu"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="appt-cal">
        <Icon name="calendar" size={16} /> Add to calendar
      </summary>

      <div className="appt-menu-list">
        <a
          href={google}
          target="_blank"
          rel="noopener noreferrer"
          onClick={close}
        >
          Google Calendar
        </a>

        <a
          href={outlook}
          target="_blank"
          rel="noopener noreferrer"
          onClick={close}
        >
          Outlook.com
        </a>

        <button
          type="button"
          onClick={() => {
            downloadIcs(a);
            close();
          }}
        >
          Apple / other (.ics file)
        </button>
      </div>
    </details>
  );
}

function YourTime({ a }) {
  const mine = yourTime(a.slot.day, a.slot.slotTime);

  return mine ? <p className="dash-muted">Your time: {mine}</p> : null;
}

function Msg({ msg }) {
  return (
    <>
      {msg.err && (
        <p className="booking-error" role="alert">
          {msg.err}
        </p>
      )}

      {msg.ok && (
        <p className="dash-ok" role="status">
          {msg.ok}
        </p>
      )}
    </>
  );
}


function AdminSlots() {
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);

 
async function add(event) {
  event.preventDefault();

  const formElement = event.currentTarget;
  const form = new FormData(formElement);

  const day = String(form.get("day"));
  const start = String(form.get("start"));
  const end = String(form.get("end"));

  const now = dublinClock(new Date());

  if (day < now.date || (day === now.date && start <= now.time)) {
    setMsg({
      err: "That time has already passed. Pick a start time in the future (Dublin time).",
    });
    return;
  }

  if (end <= start) {
    setMsg({
      err: "The end time must be after the start time.",
    });
    return;
  }

  setMsg({});
  setBusy(true);

  try {
    await api(BOOKING_URL, "/api/v1/tpv/slots", {
      method: "POST",
      body: {
        country: form.get("country"),
        visaType: form.get("visaType"),
        day,
        slotTime: `${start} - ${end}`,
      },
    });

    formElement.reset();

    setMsg({
      ok: "Slot added successfully.",
    });
  } catch (error) {
    setMsg({ err: error.message });
  } finally {
    setBusy(false);
  }
}


  return (
    <section className="profile-card admin-home-add-slot">
      <div className="profile-card-heading">
        <div>
          <h2>Add a slot</h2>
          <p>
            Pick the day, times, country, and visa type. Times are Dublin time
            and must be in the future.
          </p>
        </div>
      </div>

      <form className="booking-form" onSubmit={add}>
        <div className="booking-field">
          <label htmlFor="homeAdminCountry">Country</label>
          <select
            id="homeAdminCountry"
            name="country"
            defaultValue=""
            required
          >
            <option value="">Select</option>
            {COUNTRIES.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </div>

        <div className="booking-field">
          <label htmlFor="homeAdminVisa">Visa type</label>
          <select
            id="homeAdminVisa"
            name="visaType"
            defaultValue=""
            required
          >
            <option value="">Select</option>
            {VISA_TYPES.map((visaType) => (
              <option key={visaType} value={visaType}>
                {visaType}
              </option>
            ))}
          </select>
        </div>

        <div className="booking-field booking-field-full">
          <label htmlFor="homeAdminDay">Day</label>
          <input
            id="homeAdminDay"
            name="day"
            type="date"
            min={dublinClock(new Date()).date}
            required
          />
        </div>

        <div className="booking-field">
          <label htmlFor="homeAdminStart">Start (Dublin time)</label>
          <input
            id="homeAdminStart"
            name="start"
            type="time"
            required
          />
        </div>

        <div className="booking-field">
          <label htmlFor="homeAdminEnd">End (Dublin time)</label>
          <input
            id="homeAdminEnd"
            name="end"
            type="time"
            required
          />
        </div>

        <Msg msg={msg} />

        <button className="booking-submit" type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add slot"}
        </button>
      </form>
    </section>
  );
}

// Why the AI wasn't used, in words an admin understands.
const FALLBACK_TEXT = {
  timeout: "the AI took too long",
  model_error: "the AI is not available",
  invalid_answer: "the AI gave an unusable answer",
  breaker_open: "the AI is paused after repeated failures",
};

// How many slots a country/visa type can use at most: the people waiting minus the free slots
// (and never more than 40 in one plan).
function slotsNeeded(snapshot, item) {
  const r = snapshot.find((s) => s.country === item.country && s.visaType === item.visaType);
  return r ? Math.min(40, Math.max(0, r.subscribers - r.freeSlots)) : 0;
}

// AI release planner: suggests where to add slots, the admin checks and approves.
// Nothing is created until "Approve" is clicked.
function AdminPlanner() {
  const [plan, setPlan] = useState(null);
  const [counts, setCounts] = useState({});
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState("");

  async function suggest() {
    setMsg({});
    setBusy("plan");
    try {
      const p = await api(AI_URL, "/plans", { method: "POST" });
      setPlan(p);
      setCounts(Object.fromEntries(p.items.map((i) => [`${i.country}|${i.visaType}`, Math.min(i.slots, slotsNeeded(p.snapshot, i))])));
    } catch (error) {
      setMsg({ err: error.message });
    } finally {
      setBusy("");
    }
  }

  async function approve() {
    setMsg({});
    setBusy("approve");
    try {
      const items = plan.items.map((i) => ({ country: i.country, visaType: i.visaType, slots: Number(counts[`${i.country}|${i.visaType}`]) || 0 }));
      const r = await api(AI_URL, `/plans/${plan.planId}/approve`, { method: "POST", body: { items } });
      setPlan(null);
      setMsg({ ok: r.alreadyApproved ? "This plan was already approved." : `Created ${r.created} slots${r.skipped ? ` (${r.skipped} already existed)` : ""}. Subscribers are being told.` });
    } catch (error) {
      setMsg({ err: error.message });
    } finally {
      setBusy("");
    }
  }

  const row = (i) => plan.snapshot.find((s) => s.country === i.country && s.visaType === i.visaType);
  const asOf = plan && new Date(plan.dataAsOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <section className="profile-card admin-home-add-slot ai-planner">
      <div className="profile-card-heading">
        <div>
          <h2>AI release planner <span className="ai-badge">AI</span></h2>
          <p>Suggests where to add slots, based on how many people are waiting and how many slots are free. Nothing is created until you approve.</p>
        </div>
      </div>

      {!plan && (
        <button className="booking-submit" type="button" onClick={suggest} disabled={busy === "plan"}>
          {busy === "plan" ? "Thinking…" : "Suggest release plan"}
        </button>
      )}

      {plan && (
        <>
          <p className="dash-muted">
            {plan.source === "ai"
              ? `Suggested by ${plan.model} (prompt ${plan.promptVersion}) in ${(plan.tookMs / 1000).toFixed(1)} s · data as of ${asOf}`
              : `Rule-based plan, because ${FALLBACK_TEXT[plan.fallbackReason] || "the AI is not available"} · data as of ${asOf}`}
          </p>

          {plan.items.length === 0 ? (
            <p className="dash-ok">Nothing to add: free slots cover everyone who is waiting.</p>
          ) : (
            <div className="ai-plan-table">
              <table>
                <thead>
                  <tr><th>Country · visa</th><th>Waiting</th><th>Free</th><th>Add</th><th>When</th><th>Why</th></tr>
                </thead>
                <tbody>
                  {plan.items.map((i) => {
                    const key = `${i.country}|${i.visaType}`;
                    return (
                      <tr key={key}>
                        <td><strong>{i.country} · {i.visaType}</strong></td>
                        <td>{row(i)?.subscribers}</td>
                        <td>{row(i)?.freeSlots}</td>
                        <td>
                          <input type="number" min="0" max={slotsNeeded(plan.snapshot, i)} aria-label={`Slots to add for ${i.country} ${i.visaType}`}
                            value={counts[key]}
                            onChange={(e) => setCounts({ ...counts, [key]: e.target.value === "" ? "" : Math.min(Math.max(0, Math.floor(Number(e.target.value)) || 0), slotsNeeded(plan.snapshot, i)) })} />
                        </td>
                        <td>{i.firstDay === i.lastDay ? i.firstDay : `${i.firstDay} → ${i.lastDay}`}</td>
                        <td>
                          {i.reason}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="ai-plan-actions">
            {plan.items.length > 0 && (
              <button className="booking-submit" type="button" onClick={approve} disabled={busy === "approve"}>
                {busy === "approve" ? "Creating slots…" : "Approve & create slots"}
              </button>
            )}
            <button className="slot-btn" type="button" onClick={() => setPlan(null)} disabled={Boolean(busy)}>Discard</button>
          </div>
        </>
      )}

      <Msg msg={msg} />
    </section>
  );
}

function Pager({ page, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        marginTop: 16,
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        className="slot-btn"
        style={smallButtonStyle}
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        ← Prev
      </button>

      <span className="dash-muted">
        Page {page} of {pages}
      </span>

      <button
        type="button"
        className="slot-btn"
        style={smallButtonStyle}
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next →
      </button>
    </div>
  );
}

function AdminUsers({ me }) {
  const [page, setPage] = useState(1);
  const [role, setRole] = useState("");
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    let stale = false;

    setRows(null);

    const query = new URLSearchParams({ page, limit: LIMIT });
    if (role) query.set("role", role);

    api(AUTH_URL, `/admin/users?${query}`)
      .then((response) => {
        if (!stale) {
          setRows(response.data);
          setTotal(response.total);
          setError("");
        }
      })
      .catch((err) => {
        if (!stale) setError(err.message);
      });

    return () => {
      stale = true;
    };
  }, [page, role]);

  async function change(user, path, body, question) {
    if (!window.confirm(question)) return;

    setBusy(user.id);
    setError("");

    try {
      const response = await api(
        AUTH_URL,
        `/admin/users/${user.id}/${path}`,
        { method: "PATCH", body }
      );

      setRows((list) =>
        list.map((item) => (item.id === user.id ? response.user : item))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div
        className="booking-field"
        style={{ maxWidth: 220, marginBottom: 16 }}
      >
        <label htmlFor="homeAdminRoleFilter">Show</label>

        <select
          id="homeAdminRoleFilter"
          value={role}
          onChange={(event) => {
            setRole(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All users</option>
          <option value="user">Users only</option>
          <option value="admin">Admins only</option>
        </select>
      </div>

      {error && (
        <p className="booking-error" role="alert">
          {error}
        </p>
      )}

      {rows === null && !error ? (
        <p className="dash-muted">Loading…</p>
      ) : (
        rows && (
          <ul className="dash-list">
            {rows.map((user) => (
              <li key={user.id}>
                <span>
                  <strong>{user.fullName}</strong>{" "}
                  {user.id === me.id && (
                    <span className="dash-muted">(you)</span>
                  )}
                  <br />

                  <span className="dash-muted">
                    {user.email} · {user.role === "admin" ? "Admin" : "User"} ·{" "}
                    {user.isActive ? "Active" : "Disabled"} · joined{" "}
                    {when(user.createdAt)}
                  </span>
                </span>

                <span
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    className="slot-btn"
                    style={smallButtonStyle}
                    disabled={user.id === me.id || busy === user.id}
                    onClick={() =>
                      change(
                        user,
                        "status",
                        { isActive: !user.isActive },
                        `${user.isActive ? "Disable" : "Enable"} ${user.email}?`
                      )
                    }
                  >
                    {user.isActive ? "Disable" : "Enable"}
                  </button>

                  <button
                    type="button"
                    className="slot-btn"
                    style={smallButtonStyle}
                    disabled={user.id === me.id || busy === user.id}
                    onClick={() =>
                      change(
                        user,
                        "role",
                        {
                          role: user.role === "admin" ? "user" : "admin",
                        },
                        `Make ${user.email} ${
                          user.role === "admin"
                            ? "a normal user"
                            : "an admin"
                        }?`
                      )
                    }
                  >
                    {user.role === "admin" ? "Make user" : "Make admin"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )
      )}

      <Pager page={page} total={total} onPage={setPage} />
    </>
  );
}

function AdminLogs() {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let stale = false;

    setRows(null);

    api(AUTH_URL, `/admin/logs?page=${page}&limit=${LIMIT}`)
      .then((response) => {
        if (!stale) {
          setRows(response.data);
          setTotal(response.total);
          setError("");
        }
      })
      .catch((err) => {
        if (!stale) setError(err.message);
      });

    return () => {
      stale = true;
    };
  }, [page]);

  const detail = (log) => {
    const metadata = log.metadata || {};

    if (log.action === "USER_ROLE_CHANGED" && metadata.role) {
      return `new role: ${metadata.role}`;
    }

    return log.targetId && log.targetId !== log.actorId
      ? `user ${log.targetId.slice(0, 8)}`
      : "";
  };

  return (
    <>
      {error && (
        <p className="booking-error" role="alert">
          {error}
        </p>
      )}

      {rows === null && !error ? (
        <p className="dash-muted">Loading…</p>
      ) : (
        rows &&
        (rows.length === 0 ? (
          <p className="dash-muted">Nothing logged yet.</p>
        ) : (
          <ul className="dash-list">
            {rows.map((log) => (
              <li key={log.id}>
                <span>
                  <strong>{ACTIONS[log.action] || log.action}</strong>
                  <br />

                  <span className="dash-muted">
                    {log.actorEmail}
                    {detail(log) ? ` · ${detail(log)}` : ""}
                  </span>
                </span>

                <span className="dash-muted">{when(log.createdAt)}</span>
              </li>
            ))}
          </ul>
        ))
      )}

      <Pager page={page} total={total} onPage={setPage} />
    </>
  );
}

function InlineAdminHome({ user }) {
  const [tab, setTab] = useState("users");

  return (
    <section className="admin-home" aria-labelledby="admin-home-title">
      <header className="admin-home-header">
        <div>
          <span className="section-kicker">ADMINISTRATION</span>
          <h2 id="admin-home-title">Admin panel</h2>
          <p>Manage appointment slots, accounts, and activity.</p>
        </div>
      </header>

      <AdminPlanner />
      
      <AdminSlots />

      <section
        className="profile-card admin-home-section"
        aria-label="Admin account tools"
      >
        <div className="admin-tabs" role="tablist" aria-label="Admin tools">
          <button
            type="button"
            className="slot-btn"
            role="tab"
            aria-selected={tab === "users"}
            onClick={() => setTab("users")}
          >
            Users
          </button>

          <button
            type="button"
            className="slot-btn"
            role="tab"
            aria-selected={tab === "logs"}
            onClick={() => setTab("logs")}
          >
            Activity log
          </button>
        </div>

        <div className="admin-home-list-panel">
          {tab === "users" ? (
            <AdminUsers me={user} />
          ) : (
            <AdminLogs />
          )}
        </div>
      </section>
    </section>
  );
}

function Dashboard({ user }) {
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

   useEffect(() => {
    if (user?.role === "admin") return; 
    api(BOOKING_URL, "/api/v1/bookings/my-slots")
      .then((response) => setBookings(response.data))
      .catch((err) => setError(err.message));
  }, [user?.role]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const items = (bookings || []).map((appointment) => ({
    a: appointment,
    start: times(appointment).start,
    ...phaseOf(appointment, now),
  }));

  const upcoming = items
    .filter((item) => item.phase !== "past")
    .sort((a, b) => a.start - b.start);

  const past = items
    .filter((item) => item.phase === "past")
    .sort((a, b) => b.start - a.start);

  const next = upcoming[0];
  const others = [...upcoming.slice(1), ...past];

  const profileDone = Boolean(user.mobile && user.nationality);
  const name = displayNameOf(user);

  if (user?.role === "admin") {
    return (
      <div className="home-page">
        <main className="home-content" id="main" tabIndex={-1}>
          <section className="welcome" aria-labelledby="welcome-title">
            <div className="welcome-copy">
              <span className="eyebrow">
                <span className="eyebrow-dot" />
                YOUR VISA JOURNEY
              </span>

              <h1 id="welcome-title">
                Welcome back,
                <br />
                <span>{name || "Admin"}.</span>
              </h1>

              <p className="welcome-description">
                Manage appointment slots, user accounts, and activity from
                your Home page.
              </p>
            </div>
          </section>

          <InlineAdminHome user={user} />
        </main>

        <footer className="home-footer">
          <div className="footer-brand">
            <span className="footer-mark">B</span>
            <span>Book My Visa</span>
          </div>
          <p>One step at a time.</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="home-page">
      <main className="home-content" id="main" tabIndex={-1}>
        <section className="welcome" aria-labelledby="welcome-title">
          <div className="welcome-copy">
            <span className="eyebrow">
              <span className="eyebrow-dot" />
              YOUR VISA JOURNEY
            </span>

            <h1 id="welcome-title">
              {name ? (
                <>
                  Welcome back,
                  <br />
                  <span>{name}.</span>
                </>
              ) : (
                <>
                  Your next chapter
                  <br />
                  <span>starts here.</span>
                </>
              )}
            </h1>

            <p className="welcome-description">
              A clearer way to organise your visa journey. See your
              appointments and take the next step when you are ready.
            </p>

            <div className="welcome-actions">
              <a className="button-primary" href="#/booking">
                <Icon name="calendar" size={19} />
                Book an appointment
                <Icon name="chevron" size={17} />
              </a>
            </div>
          </div>

          <aside className="progress-card" aria-label="Next appointment">
            <div className="progress-card-top">
              <span className="progress-label">NEXT APPOINTMENT</span>
            </div>

            {error ? (
              <p className="booking-error" role="alert">
                {error}
              </p>
            ) : bookings === null ? (
              <p className="dash-muted" role="status">
                Loading…
              </p>
            ) : next ? (
              <div className="next-appt">
                <p className="next-appt-when">{next.text}</p>

                <p className="next-appt-what">
                  {next.a.slot.country} · {next.a.slot.visaType}
                </p>

                <p className="dash-muted">
                  {fmtDay(next.a.slot.day)},{" "}
                  {slotText(next.a.slot.day, next.a.slot.slotTime)}
                </p>

                <YourTime a={next.a} />
                <CalendarButton a={next.a} />

                {upcoming.length > 1 && (
                  <p className="dash-muted">
                    +{upcoming.length - 1} more upcoming
                  </p>
                )}
              </div>
            ) : (
              <div className="next-appt">
                <p className="next-appt-when">
                  {items.length ? "Nothing coming up" : "Nothing booked"}
                </p>

                <p className="dash-muted">
                  {profileDone
                    ? "Pick a free slot whenever you are ready."
                    : "Add your mobile number and nationality to start booking."}
                </p>

                {!profileDone && (
                  <a className="inline-route-note" href="#/profile">
                    Open your profile →
                  </a>
                )}
              </div>
            )}
          </aside>
        </section>

        {others.length > 0 && (
          <section
            className="status-panel"
            id="status-info"
            aria-labelledby="status-title"
          >
            <div className="status-heading">
              <span className="status-icon" aria-hidden="true">
                <Icon name="search" size={22} />
              </span>

              <div>
                <span className="section-kicker">YOUR BOOKINGS</span>
                <h2 id="status-title">Other appointments</h2>
                <p>
                  Your next appointment is shown above. These are your
                  remaining bookings, upcoming first.
                </p>
              </div>
            </div>

            <div className="appt-grid">
              {others.map(({ a, phase, text }) => (
                <article
                  key={a.appointmentId}
                  className={`appt-card appt-${phase}`}
                >
                  <div className="appt-top">
                    <strong>
                      {a.slot.country} · {a.slot.visaType}
                    </strong>
                    <span className="appt-badge">{text}</span>
                  </div>

                  <p className="appt-when">
                    {fmtDay(a.slot.day)}
                    <br />
                    {slotText(a.slot.day, a.slot.slotTime)}
                  </p>

                  {phase !== "past" && <YourTime a={a} />}

                  <div className="appt-bottom">
                    <span className="dash-muted">
                      Ref {a.appointmentId.slice(0, 8).toUpperCase()}
                    </span>

                    {phase !== "past" && <CalendarButton a={a} />}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="help" aria-labelledby="help-title">
          <div className="help-symbol" aria-hidden="true">
            <Icon name="external" size={24} />
          </div>

          <div className="help-copy">
            <span className="section-kicker">TRUSTED INFORMATION</span>
            <h2 id="help-title">Check the requirements.</h2>
            <p>Rules vary by destination and personal circumstances.</p>
          </div>

          <a
            className="help-button"
            href={OFFICIAL_GUIDANCE}
            target="_blank"
            rel="noopener noreferrer"
          >
            EU guidance <Icon name="external" size={16} />
          </a>
        </section>
      </main>

      <footer className="home-footer">
        <div className="footer-brand">
          <span className="footer-mark">B</span>
          <span>Book My Visa</span>
        </div>
        <p>One step at a time.</p>
      </footer>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();

  return <Dashboard key={user?.id} user={user} />;
}