import { Suspense } from "react";
import PeopleDirectory from "@/components/people/PeopleDirectory";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/** Reads the deep-link query (department / chat / about) at request time. */
async function PeopleWithParams({ searchParams }: { searchParams: SearchParams }) {
  const { department, chat, about } = await searchParams;
  return (
    <PeopleDirectory
      initialDepartment={typeof department === "string" ? department : "All"}
      initialChat={typeof chat === "string" ? chat : undefined}
      initialTopic={typeof about === "string" ? about : undefined}
    />
  );
}

export default function PeoplePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto w-full max-w-[1380px] flex-1 px-5 py-8 lg:px-10">
      {/* The static shell renders the directory immediately; the query
          string is applied once the request-time part streams in. */}
      <Suspense fallback={<PeopleDirectory />}>
        <PeopleWithParams searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
