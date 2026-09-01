"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

const SESSION = "prism-web-session";

type Comment = { author: string; body: string };

export function signedIn(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(SESSION) === "1";
}

export function setSignedIn(value: boolean) {
  if (value) {
    window.localStorage.setItem(SESSION, "1");
  } else {
    window.localStorage.removeItem(SESSION);
  }
}

export function CommentsPanel({ modId }: { modId: string }) {
  const [authed, setAuthed] = useState(false);
  const [items, setItems] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [rating, setRating] = useState("5");
  const storageKey = `prism-comments:${modId}`;
  const ratingKey = `prism-rating:${modId}`;

  useEffect(() => {
    setAuthed(signedIn());
    try {
      const raw = window.localStorage.getItem(storageKey);
      setItems(raw ? (JSON.parse(raw) as Comment[]) : []);
    } catch {
      setItems([]);
    }
  }, [storageKey]);

  function publish(e: FormEvent) {
    e.preventDefault();
    if (!authed || !body.trim()) {
      return;
    }
    const next = [...items, { author: "you", body: body.trim() }];
    setItems(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    window.localStorage.setItem(ratingKey, rating);
    setBody("");
  }

  return (
    <section>
      <h2>Comments and ratings</h2>
      <ul className="comments">
        {items.length === 0 ? <li>No comments yet.</li> : null}
        {items.map((item, i) => (
          <li key={`${item.author}-${i}`}>
            <strong>{item.author}</strong>
            <p>{item.body}</p>
          </li>
        ))}
      </ul>
      {authed ? (
        <form className="stack" onSubmit={publish}>
          <label>
            Rating
            <select value={rating} onChange={(e) => setRating(e.target.value)}>
              <option value="5">5</option>
              <option value="4">4</option>
              <option value="3">3</option>
              <option value="2">2</option>
              <option value="1">1</option>
            </select>
          </label>
          <label>
            Comment
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} required />
          </label>
          <button type="submit" className="btn-solid">
            Post
          </button>
        </form>
      ) : (
        <p>
          <Link href="/signin">Sign in</Link> to comment or rate. Anyone may read and install without an
          account.
        </p>
      )}
    </section>
  );
}
