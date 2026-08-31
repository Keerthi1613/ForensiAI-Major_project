import React, { useState, useEffect } from "react";
import Timeline from "../components/Timeline.jsx";
import { getTimeline } from "../services/api.js";
import { FiRefreshCw, FiClock } from "react-icons/fi";

export default function TimelinePage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTimeline();
  }, []);

  const fetchTimeline = async () => {
    setLoading(true);
    try {
      const data = await getTimeline();
      setEvents(data || []);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Sequence data unavailable");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12 max-w-4xl mx-auto">
      <div className="flex justify-between items-center border-b border-divider pb-4">
        <div>
          <h1 className="text-xl">Event Timeline</h1>
          <p className="text-[0.7rem] text-text-secondary mt-1 font-mono uppercase tracking-widest">Sequential Forensics Audit</p>
        </div>
        <button
          onClick={fetchTimeline}
          disabled={loading}
          className="btn-outline flex items-center gap-2"
        >
          <FiRefreshCw className={loading ? "animate-spin" : ""} size={14} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/20 p-4 rounded-sm text-danger text-[0.7rem] font-mono uppercase tracking-wider flex items-center gap-3">
           <FiClock /> {error}
        </div>
      )}

      <div className="mt-8">
        {loading && events.length === 0 ? (
          <div className="py-20 text-center space-y-4">
             <div className="h-5 w-5 border border-divider border-t-primary rounded-full animate-spin mx-auto" />
             <p className="font-mono text-[0.65rem] text-text-muted uppercase tracking-widest">Reconstructing Sequence...</p>
          </div>
        ) : (
          <Timeline events={events} />
        )}
      </div>
    </div>
  );
}
