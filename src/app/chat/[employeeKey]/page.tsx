import type { Metadata } from "next";
import { Suspense } from "react";
import ChatPage from "@/components/people/ChatPage";
import PageLoader from "@/components/PageLoader";

export const metadata: Metadata = {
  title: "Chat",
  description: "A one-to-one conversation with someone at Veloxa.",
};

export default function ChatRoute() {
  return (
    <main className="mx-auto w-full max-w-[1180px] px-3 py-5 md:px-6 md:py-8">
      <Suspense fallback={<PageLoader lines={["Opening the conversation"]} />}>
        <ChatPage />
      </Suspense>
    </main>
  );
}
