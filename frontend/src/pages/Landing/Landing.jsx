import "./Landing.css";

export default function Landing() {
  return (
    <div className="landing">
      <section className="landing-hero">
        <div className="landing-content">
          <span className="landing-badge">
            <span className="badge-dot" />
            YOUR JOURNEY STARTS HERE
          </span>

          <h1>
            Your world.
            <br />
            <span>Your next destination.</span>
          </h1>

          <p>
            Take the first step towards your next journey.
            Book My Visa makes it easier to get started with
            your visa appointment process.
          </p>

          <div className="landing-actions">
            <a className="landing-btn primary" href="#/login">
              Login <span aria-hidden="true">→</span>
            </a>

            <a className="landing-btn secondary" href="#/register">
              Create an account
            </a>
          </div>

          <div className="landing-trust">
            <span className="trust-icon">✓</span>
            A simple place to begin your visa journey
          </div>
        </div>

        <div className="landing-visual" aria-label="Travel passport illustration">
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <div className="visual-globe">
            <div className="globe-longitude longitude-one" />
            <div className="globe-longitude longitude-two" />
            <div className="globe-latitude latitude-one" />
            <div className="globe-latitude latitude-two" />
          </div>

          <svg
            className="flight-path"
            viewBox="0 0 420 300"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M35 225 C 100 20, 260 15, 370 105"
              stroke="#7995E8"
              strokeWidth="2"
              strokeDasharray="5 8"
              strokeLinecap="round"
            />
            <circle cx="35" cy="225" r="5" fill="#D4A84E" />
            <circle cx="370" cy="105" r="5" fill="#315CE8" />
            <path
              d="M350 82 L370 105 L397 98 L370 105 L362 129 L370 105"
              stroke="#315CE8"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          <div className="passport">
            <div className="passport-inner">
              <div className="passport-heading">
                <span>✦</span>
                <span>TRAVEL DOCUMENT</span>
              </div>

              <div className="passport-emblem">
                <svg
                  viewBox="0 0 120 120"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="60"
                    cy="60"
                    r="43"
                    stroke="#D9B86C"
                    strokeWidth="1.5"
                  />
                  <ellipse
                    cx="60"
                    cy="60"
                    rx="20"
                    ry="43"
                    stroke="#D9B86C"
                    strokeWidth="1.5"
                  />
                  <ellipse
                    cx="60"
                    cy="60"
                    rx="43"
                    ry="16"
                    stroke="#D9B86C"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M20 45 H100 M17 60 H103 M20 75 H100"
                    stroke="#D9B86C"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M60 17 L64 48 L92 60 L64 65 L60 103 L55 65 L28 60 L55 48 Z"
                    stroke="#D9B86C"
                    strokeWidth="1.2"
                  />
                </svg>
              </div>

              <div className="passport-title">PASSPORT</div>
              <div className="passport-subtitle">INTERNATIONAL TRAVEL</div>

              <div className="passport-bottom">
                <span>EXPLORE</span>
                <span>DISCOVER</span>
                <span>CONNECT</span>
              </div>
            </div>
          </div>

          <div className="floating-label label-top">
            <span className="label-icon">✧</span>
            <span>
              <strong>Your next journey</strong>
              <small>Starts with one step</small>
            </span>
          </div>

          <div className="floating-label label-bottom">
            <span className="location-icon">⌖</span>
            <span>
              <strong>New possibilities</strong>
              <small>One journey at a time</small>
            </span>
          </div>
        </div>
      </section>

      <section className="landing-intro">
        <span className="landing-eyebrow">WELCOME TO BOOK MY VISA</span>
        <h2>Make your first step a little simpler.</h2>
        <p>
          Start with an account to access our services and find your
          way through the visa appointment process with a clearer,
          more straightforward experience.
        </p>
      </section>

      <section className="landing-benefits">
        <article className="benefit-card">
          <span className="benefit-number">01</span>
          <h3>Start with clarity</h3>
          <p>
            Get started with a simple experience designed to help
            you understand your next steps.
          </p>
        </article>

        <article className="benefit-card">
          <span className="benefit-number">02</span>
          <h3>Everything in one place</h3>
          <p>
            Access the platform services from your account after
            signing in.
          </p>
        </article>

        <article className="benefit-card">
          <span className="benefit-number">03</span>
          <h3>Move at your pace</h3>
          <p>
            Sign in when you're ready and continue your visa journey
            from your home page.
          </p>
        </article>
      </section>
    </div>
  );
}
