"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useWebSession } from "../lib/web-session";

type Comment = { author: string; body: string };

export function CommentsPanel({ modId }: { modId: string }) {
  const { authenticated, loading, user } = useWebSession();
  const [items, setItems] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [rating, setRating] = useState("5");
  const storageKey = `prism-comments:${modId}`;
  const ratingKey = `prism-rating:${modId}`;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      setItems(raw ? (JSON.parse(raw) as Comment[]) : []);
    } catch {
      setItems([]);
    }
  }, [storageKey]);

  function publish(e: FormEvent) {
    e.preventDefault();
    if (!authenticated || !body.trim()) {
      return;
    }
    const author = user?.name ?? user?.email ?? "you";
    const next = [...items, { author, body: body.trim() }];
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
      {loading ? null : authenticated ? (
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
