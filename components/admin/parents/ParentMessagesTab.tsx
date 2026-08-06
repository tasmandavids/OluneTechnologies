"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { MessageThread } from "@/components/admin/messages/MessageThread";
import { MESSAGE_TOPICS, type MessageTopic } from "@/lib/portal/message-topics";

export default function ParentMessagesTab({
  currentUserId,
  parentId,
  parentName,
}: {
  currentUserId: string;
  parentId: string;
  parentName: string;
}) {
  const t = useTranslations("admin.parents.messages");
  const tTopics = useTranslations("parent.chat.topics");
  const [topic, setTopic] = useState<MessageTopic>("general");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {t("description", { name: parentName })}
        </p>
        <Link
          href={`/portal/admin/messages?with=${parentId}&topic=${topic}`}
          className="text-sm font-semibold text-ink underline"
        >
          {t("openInHub")}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {MESSAGE_TOPICS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTopic(item)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              topic === item
                ? "bg-brand text-white"
                : "border border-[--hair] text-muted hover:text-ink"
            }`}
          >
            {tTopics(`${item}.label`)}
          </button>
        ))}
      </div>

      <div className="box overflow-hidden rounded-2xl">
        <MessageThread
          currentUserId={currentUserId}
          peerId={parentId}
          topic={topic}
          contact={{
            id: parentId,
            name: parentName,
            role: "parent",
            subtitle: tTopics(`${topic}.subtitle`),
          }}
          compact
        />
      </div>
    </div>
  );
}
