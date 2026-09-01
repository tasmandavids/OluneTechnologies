"use client";

// ============================================================================
//  MessageStreamProvider — live incoming messages, over Supabase Realtime.
//
//  Previously this opened an EventSource against /api/messages/stream, which
//  held a Node function open for the lifetime of every connected tab purely to
//  relay a Realtime channel the browser could subscribe to itself. Three
//  reasons that had to go:
//
//    • React Native's fetch does not hold an SSE connection reliably, and the
//      parent app needs this exact feature.
//    • One long-lived serverless invocation per connected user is a real cost
//      and a hard concurrency ceiling, for a hop that adds nothing.
//    • The relay could not re-authenticate. When the access token expired the
//      stream stayed open and silently stopped delivering; here supabase-js
//      pushes the refreshed token into the socket on its own.
//
//  RLS is what makes subscribing from the browser safe: `messages_participant`
//  (0047) only admits rows where the caller is sender or recipient, and
//  postgres_changes applies it per subscriber. The filter below is a narrowing,
//  not the security boundary.
//
//  The context API — `subscribe(listener)` — is unchanged, so MessageThread,
//  MessagesPanel and ParentChatPanel are untouched.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { ThreadMessage } from "@/components/admin/messages/MessageThread";

type MessageListener = (msg: ThreadMessage) => void;

type MessageStreamContextValue = {
  subscribe: (listener: MessageListener) => () => void;
};

const MessageStreamContext = createContext<MessageStreamContextValue | null>(null);

export function MessageStreamProvider({
  currentUserId,
  children,
}: {
  currentUserId: string;
  children: ReactNode;
}) {
  const listenersRef = useRef<Set<MessageListener>>(new Set());
  const [connected, setConnected] = useState(false);

  const subscribe = useCallback((listener: MessageListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`user-messages:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `to_user_id=eq.${currentUserId}`,
        },
        (payload) => {
          const newMsg = payload.new as ThreadMessage;
          // Which side of the conversation the other person is on. Every row
          // here is addressed to us, so the peer is always the sender — but the
          // ternary is kept so the shape survives if the filter ever widens.
          const peerId =
            newMsg.from_user_id === currentUserId ? newMsg.to_user_id : newMsg.from_user_id;
          const enriched = { ...newMsg, _peerId: peerId } as ThreadMessage & { _peerId: string };
          listenersRef.current.forEach((fn) => fn(enriched));
        },
      )
      .subscribe((status) => {
        // TIMED_OUT and CHANNEL_ERROR are retried by supabase-js on its own
        // backoff; reflecting them keeps the assistive-tech announcement honest
        // without us reimplementing reconnection.
        setConnected(status === "SUBSCRIBED");
      });

    return () => {
      setConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  return (
    <MessageStreamContext.Provider value={{ subscribe }}>
      {children}
      {!connected && (
        <span className="sr-only" aria-live="polite">
          reconnecting
        </span>
      )}
    </MessageStreamContext.Provider>
  );
}

export function useMessageStream() {
  const ctx = useContext(MessageStreamContext);
  return ctx;
}
