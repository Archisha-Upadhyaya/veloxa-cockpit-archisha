import { createClient } from "@supabase/supabase-js";
import {
  ANSWERS,
  AS_OF_SNAPSHOTS,
  CITATIONS,
  PEOPLE,
  RISKS,
} from "../src/lib/data";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY before seeding.",
  );
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function assertNoError<T>(
  result: { data: T | null; error: { message: string } | null },
  operation: string,
): T {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${operation}: no row returned`);
  return result.data;
}

function assertSuccess(
  result: { error: { message: string } | null },
  operation: string,
) {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
}

function sourceType(kind: string) {
  if (kind === "board_update") return "pdf";
  if (kind === "export") return "spreadsheet";
  return kind;
}

async function findOrInsert<T extends { id: string }>(
  table: string,
  lookup: Record<string, string>,
  values: Record<string, unknown>,
  operation: string,
): Promise<T> {
  const lookupResult = await supabase
    .from(table)
    .select("id")
    .match(lookup)
    .maybeSingle();
  if (lookupResult.error) {
    throw new Error(`find ${operation}: ${lookupResult.error.message}`);
  }
  const existing = lookupResult.data;
  if (existing) {
    return assertNoError<T>(
      await supabase.from(table).update(values).match({ id: existing.id }).select("id").single(),
      `update ${operation}`,
    );
  }
  return assertNoError<T>(
    await supabase.from(table).insert(values).select("id").single(),
    `insert ${operation}`,
  );
}

function releaseDay(label: string) {
  if (label.includes("Apr–Jun")) return "2026-07-08";
  if (label.includes("Jul–Sep")) return "2026-10-06";
  if (label.includes("Employee Master")) return "2026-10-31";
  return "2026-03-10";
}

async function seedPeople() {
  for (const person of PEOPLE) {
    const profile = {
      joined: person.joined,
      location: person.location,
      groundedFacts: person.groundedFacts,
      assumedDetails: person.assumedDetails,
      interview: person.interview,
    };
    const employee = assertNoError<{ id: string; employee_key: string }>(
      await supabase
        .from("employee_profiles")
        .upsert(
          {
            employee_key: person.empId,
            display_name: person.name,
            role_title: person.title,
            department: person.department,
            is_active: true,
            profile,
          },
          { onConflict: "employee_key" },
        )
        .select("id, employee_key")
        .single(),
      `employee ${person.empId}`,
    );

    assertSuccess(
      await supabase.from("agent_personas").upsert(
        {
          employee_profile_id: employee.id,
          voice_profile: { title: person.title, location: person.location },
          known_topics: person.groundedFacts,
          known_unknowns: person.interview
            .filter((exchange) => exchange.provenance === "no_visibility")
            .map((exchange) => exchange.question),
          perspective_rules: person.assumedDetails,
          persona_version: "day-1",
        },
        { onConflict: "employee_profile_id" },
      ),
      `persona ${person.empId}`,
    );
  }
}

async function seedEvidence() {
  const evidenceByRef = new Map<string, string>();

  for (const citation of Object.values(CITATIONS)) {
    const document = assertNoError<{ id: string }>(
      await supabase
        .from("source_documents")
        .upsert(
          {
            external_key: `day1:${citation.ref}`,
            title: citation.label,
            source_type: sourceType(citation.kind),
            release_day: releaseDay(citation.label),
            available_at: `${releaseDay(citation.label)}T12:00:00Z`,
            metadata: { citation_ref: citation.ref },
          },
          { onConflict: "external_key" },
        )
        .select("id")
        .single(),
      `source document ${citation.ref}`,
    );

    const location = assertNoError<{ id: string }>(
      await supabase
        .from("source_locations")
        .upsert(
          {
            source_document_id: document.id,
            locator: citation.locator,
            quoted_text: citation.excerpt,
          },
          { onConflict: "source_document_id,locator" },
        )
        .select("id")
        .single(),
      `source location ${citation.ref}`,
    );

    const evidence = await findOrInsert<{ id: string }>(
      "evidence_items",
      { source_location_id: location.id },
      {
        source_location_id: location.id,
        evidence_text: citation.excerpt,
        available_at: `${releaseDay(citation.label)}T12:00:00Z`,
      },
      `evidence ${citation.ref}`,
    );
    evidenceByRef.set(citation.ref, evidence.id);
  }

  return evidenceByRef;
}

async function seedAnswers(evidenceByRef: Map<string, string>) {
  for (const answer of ANSWERS) {
    const run = await findOrInsert<{ id: string }>(
      "answer_runs",
      { question: answer.question },
      {
        question: answer.question,
        answer_text: answer.answer,
        model_version: "day-1-static-grounded",
        policy_outcome: answer.flags.includes("refused_policy")
          ? "refused"
          : "answered",
        confidence: answer.confidence,
      },
      `answer ${answer.question}`,
    );

    for (const [position, claim] of answer.claims.entries()) {
      const savedClaim = await findOrInsert<{ id: string }>(
        "claims",
        { claim_text: claim.claim },
        { claim_text: claim.claim, status: "observed" },
        `claim ${claim.claim}`,
      );

      assertSuccess(
        await supabase.from("answer_claims").upsert(
          {
            answer_run_id: run.id,
            claim_id: savedClaim.id,
            position,
          },
          { onConflict: "answer_run_id,claim_id" },
        ),
        `answer claim ${answer.question}`,
      );

      for (const ref of claim.refs) {
        const evidenceId = evidenceByRef.get(ref);
        if (!evidenceId) continue;
        assertSuccess(
          await supabase.from("claim_evidence").upsert(
            {
              claim_id: savedClaim.id,
              evidence_item_id: evidenceId,
              relationship: "supports",
            },
            { onConflict: "claim_id,evidence_item_id" },
          ),
          `claim evidence ${ref}`,
        );
      }
    }
  }
}

async function seedRisks(evidenceByRef: Map<string, string>) {
  for (const risk of RISKS) {
    const savedRisk = assertNoError<{ id: string }>(
      await supabase
        .from("risk_items")
        .upsert(
          {
            risk_key: `day1:${risk.rank}`,
            title: risk.title,
            description: `${risk.statement}\n\nInference: ${risk.inference}`,
            severity: risk.severity === "info_gap" ? "low" : risk.severity,
            likelihood: risk.likelihood,
            status: "open",
            confidence: "medium",
          },
          { onConflict: "risk_key" },
        )
        .select("id")
        .single(),
      `risk ${risk.title}`,
    );

    for (const ref of risk.refs) {
      const evidenceId = evidenceByRef.get(ref);
      if (!evidenceId) continue;
      assertSuccess(
        await supabase.from("risk_evidence").upsert(
          { risk_id: savedRisk.id, evidence_item_id: evidenceId },
          { onConflict: "risk_id,evidence_item_id" },
        ),
        `risk evidence ${ref}`,
      );
    }
  }
}

async function seedSupportingRecords() {
  for (const person of PEOPLE) {
    assertNoError<{ id: string }>(
      await supabase
        .from("entities")
        .upsert(
          {
            entity_type: "person",
            canonical_name: person.name,
            metadata: { employee_key: person.empId },
          },
          { onConflict: "entity_type,canonical_name" },
        )
        .select("id")
        .single(),
      `entity ${person.name}`,
    );

    for (const [index, statement] of person.assumedDetails.entries()) {
      assertNoError<{ id: string }>(
        await supabase
          .from("assumptions")
          .upsert(
            {
              assumption_ref: `A-${person.empId}-${index + 1}`,
              statement,
              basis: "Invented persona detail from the reviewed Day 1 UI seed.",
              confidence: "low",
              status: "active",
              what_would_change_mind: "A corresponding employee record or source document.",
            },
            { onConflict: "assumption_ref" },
          )
          .select("id")
          .single(),
        `assumption ${person.empId}-${index + 1}`,
      );
    }
  }

  for (const answer of ANSWERS) {
    const conflictNote = answer.conflictNote;
    if (!conflictNote) continue;
    await findOrInsert(
      "conflicts",
      { subject: answer.question },
      {
        subject: answer.question,
        description: conflictNote,
        resolution_status: "accepted_uncertainty",
      },
      `conflict ${answer.question}`,
    );
  }
}

async function main() {
  console.log("Seeding employee profiles and agent personas...");
  await seedPeople();
  console.log("Seeding source documents and evidence...");
  const evidenceByRef = await seedEvidence();
  console.log("Seeding claims and answer runs...");
  await seedAnswers(evidenceByRef);
  console.log("Seeding risks...");
  await seedRisks(evidenceByRef);
  console.log("Seeding entities, assumptions, and conflicts...");
  await seedSupportingRecords();
  console.log(
    `Seed complete: ${PEOPLE.length} people, ${Object.keys(CITATIONS).length} citations, ${ANSWERS.length} answers, ${RISKS.length} risks, ${AS_OF_SNAPSHOTS.length} snapshots kept for future timeline ingestion.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
