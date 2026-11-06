
import { AuthForm, AuthProvider, useAuth } from "./auth/Auth.jsx";
import Home from "./pages/Home/Home.jsx";
import Booking from "./pages/Booking/Booking.jsx";
import Profile from "./pages/Profile/Profile.jsx";
import Landing from "./pages/Landing/Landing.jsx";
import "./App.css";
import { useState, useEffect } from "react";

function Brand() {
  return (
    <a href="#/" className="brand" aria-label="Book My Visa home">
      <span className="brand-mark" aria-hidden="true">B</span>
      <span className="brand-copy">
        <strong>Book My Visa</strong>
        <small>Your journey, made clearer</small>
      </span>
    </a>
  );
}

function Header({ view, user, logout }) {
  function handleLogout() {
    logout();
    window.location.hash = "/";
  }

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Brand />

        <nav className="app-nav" aria-label="Main navigation">
          {user ? (
            <div className="authenticated-links">
              <a
                href="#/profile"
                className="profile-avatar"
                aria-label="Open profile"
                title="Profile"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="23"
                  height="23"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
                </svg>
              </a>

              <button
                type="button"
                className="nav-logout"
                onClick={handleLogout}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="17"
                  height="17"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M10 17l5-5-5-5" />
                  <path d="M15 12H3" />
                  <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
                </svg>
                <span>Log out</span>
              </button>
            </div>
          ) : (
            <div className="public-auth-links">
              {view !== "login" && (
                <a href="#/login" className="nav-login">
                  Login
                </a>
              )}

              {view !== "register" && (
                <a href="#/register" className="nav-primary">
                  Sign Up
                </a>
              )}
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}


function Shell() {
  const { user, logout } = useAuth();

  const [route, setRoute] = useState(
    window.location.hash.replace(/^#/, "") || "/"
  );

  useEffect(() => {
    function handleRoute() {
      setRoute(window.location.hash.replace(/^#/, "") || "/");
    }

    window.addEventListener("hashchange", handleRoute);

    return () => {
      window.removeEventListener("hashchange", handleRoute);
    };
  }, []);

  useEffect(() => {
    const publicRoutes = ["/", "/login", "/register"];
    const protectedRoutes = ["/home", "/booking", "/profile", "/admin"];

    if (!user && protectedRoutes.includes(route)) {
      window.location.hash = "/login";
      return;
    }

    if (user && ["/login", "/register"].includes(route)) {
      window.location.hash = "/home";
      return;
    }

    if (
      !publicRoutes.includes(route) &&
      !protectedRoutes.includes(route)
    ) {
      window.location.hash = user ? "/home" : "/";
    }
  }, [route, user]);

  const view =
    route === "/login" ? "login" :
    route === "/register" ? "register" :
    route === "/home" ? "home" :
    route === "/booking" ? "booking" :
    route === "/profile" ? "profile" :
    route === "/admin" ? "admin" :
    "landing";

  let page;

  if (view === "login") {
    page = <AuthForm mode="login" />;
  } else if (view === "register") {
    page = <AuthForm mode="register" />;
  } else if (view === "home") {
    page = user ? <Home /> : null;
  } else if (view === "booking") {
    page = user ? <Booking /> : null;
  } else if (view === "profile") {
    page = user ? <Profile /> : null;
  } else if (view === "admin") {
    page = user ? <Admin /> : null;
  } else {
    page = <Landing />;
  }

  return (
    <>
      <Header view={view} user={user} logout={logout} />
      {page}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
