import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "../api";

const KINDS = ["Birthday", "Wedding", "Baby shower", "Graduation", "Party", "Other"];

const pinIcon = L.divIcon({
  className: "map-pin",
  html: "<span></span>",
  iconSize: [28, 28],
  iconAnchor: [14, 34],
});

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}

function LocationPicker({ hasPin, onPick }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onPickRef = useRef(onPick);
  const lookupRef = useRef(0);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  function showPin(lat, lng, recenter) {
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const marker = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        spotChosen(p.lat, p.lng, false);
      });
      markerRef.current = marker;
    }
    if (recenter) map.setView([lat, lng], Math.max(map.getZoom(), 16));
  }

  // The user picked a spot by click, drag, or current location.
  async function spotChosen(lat, lng, recenter) {
    showPin(lat, lng, recenter);
    onPickRef.current(lat, lng, null);
    const lookupId = ++lookupRef.current;
    const name = await reverseGeocode(lat, lng);
    if (name && lookupId === lookupRef.current) onPickRef.current(lat, lng, name);
  }

  useEffect(() => {
    const map = L.map(mapEl.current, {
      center: [20, 0],
      zoom: 2,
      scrollWheelZoom: false,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    map.on("click", (e) => spotChosen(e.latlng.lat, e.latlng.lng, false));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // The map is created once; its handlers only use refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setStatus("");
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`
      );
      if (!res.ok) throw new Error("search failed");
      const results = await res.json();
      if (results.length === 0) {
        setStatus("No place found. Try a fuller address, or click the map to drop a pin.");
      } else {
        const hit = results[0];
        const lat = Number(hit.lat);
        const lng = Number(hit.lon);
        lookupRef.current++;
        showPin(lat, lng, true);
        onPickRef.current(lat, lng, hit.display_name);
      }
    } catch {
      setStatus("Search isn't available right now. Click the map to drop a pin instead.");
    } finally {
      setBusy(false);
    }
  }

  function locateMe() {
    if (!navigator.geolocation) {
      setStatus("Your browser can't share its location. Search or click the map instead.");
      return;
    }
    setBusy(true);
    setStatus("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        spotChosen(pos.coords.latitude, pos.coords.longitude, true);
        setBusy(false);
      },
      () => {
        setStatus("Couldn't get your location. Check the browser permission, or search instead.");
        setBusy(false);
      }
    );
  }

  return (
    <fieldset className="field">
      <legend>Where is it?</legend>
      <div className="picker-search">
        <input
          type="text"
          aria-label="Search for a place or address"
          placeholder="Search for a place or address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              runSearch();
            }
          }}
        />
        <button type="button" className="button small" onClick={runSearch} disabled={busy}>
          Search
        </button>
        <button type="button" className="tab" onClick={locateMe} disabled={busy}>
          Use my location
        </button>
      </div>
      <div className="picker-map" ref={mapEl} />
      <p className="picker-status" role="status">
        {status ||
          (hasPin
            ? "Pin placed. Drag it to fine-tune the spot."
            : "Click the map to drop a pin.")}
      </p>
    </fieldset>
  );
}

export default function CreateInvitation() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    kind: "Birthday",
    customKind: "",
    title: "",
    eventDate: "",
    location: "",
    message: "",
    latitude: null,
    longitude: null,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  function handlePick(lat, lng, name) {
    setForm((f) => ({
      ...f,
      latitude: lat,
      longitude: lng,
      location: name ?? f.location,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/api/invitations", {
        method: "POST",
        auth: true,
        body: {
          kind: form.kind === "Other" ? form.customKind.trim() : form.kind,
          title: form.title,
          message: form.message,
          location: form.location,
          latitude: form.latitude,
          longitude: form.longitude,
          eventDate: form.eventDate ? new Date(form.eventDate).toISOString() : "",
        },
      });
      navigate("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card form-card">
      <h1>Create an invitation</h1>

      <form className="stack" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span>What kind of invitation is it?</span>
          <select value={form.kind} onChange={update("kind")}>
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>

        {form.kind === "Other" && (
          <label className="field">
            <span>Describe the kind</span>
            <input type="text" value={form.customKind} onChange={update("customKind")} />
          </label>
        )}

        <label className="field">
          <span>Title</span>
          <input type="text" value={form.title} onChange={update("title")} />
        </label>

        <label className="field">
          <span>Date and time</span>
          <input
            type="datetime-local"
            value={form.eventDate}
            onChange={update("eventDate")}
          />
        </label>

        <LocationPicker hasPin={form.latitude !== null} onPick={handlePick} />

        <label className="field">
          <span>Location name</span>
          <input type="text" value={form.location} onChange={update("location")} />
          <span className="hint">
            Filled in from your pin. Edit it to say something like "Grandma's house".
          </span>
        </label>

        <label className="field">
          <span>Message for your guests</span>
          <textarea rows="4" value={form.message} onChange={update("message")} />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="actions">
          <button type="submit" className="button" disabled={busy}>
            Create invitation
          </button>
          <Link to="/dashboard">Cancel</Link>
        </div>
      </form>
    </section>
  );
}