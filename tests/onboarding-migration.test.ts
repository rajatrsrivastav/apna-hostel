import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("migrates existing courses and only resets pending students without profiles", async () => {
  const client = new PGlite();
  try {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    const targetIndex = journal.entries.findIndex((e: any) => e.tag === "0006_onboarding_status_and_course");
    for (const entry of journal.entries.slice(0, targetIndex)) {
      await client.exec(readFileSync(`drizzle/${entry.tag}.sql`, "utf8"));
    }
    await client.exec(`
      INSERT INTO users (id, name, email, approval_status) VALUES
        ('incomplete', 'Incomplete', 'incomplete@example.test', 'pending'),
        ('complete', 'Complete', 'complete@example.test', 'pending'),
        ('accepted', 'Accepted', 'accepted@example.test', 'accepted'),
        ('rejected', 'Rejected', 'rejected@example.test', 'rejected');
      INSERT INTO student_profiles (user_id, full_name, phone, course, trade, study_year)
      VALUES ('complete', 'Complete', '9876543210', 'Diploma', 'Mechanical', 'Year 2');
      BEGIN;
    `);
    await client.exec(readFileSync("drizzle/0006_onboarding_status_and_course.sql", "utf8"));
    await client.exec("COMMIT;");
    expect((await client.query("SELECT id, approval_status FROM users ORDER BY id")).rows).toEqual([
      { id: "accepted", approval_status: "accepted" },
      { id: "complete", approval_status: "pending" },
      { id: "incomplete", approval_status: "onboarding_incomplete" },
      { id: "rejected", approval_status: "rejected" },
    ]);
    expect((await client.query("SELECT course, study_year FROM student_profiles")).rows).toEqual([{ course: "Diploma", study_year: "Year 2" }]);
    await client.exec("UPDATE student_profiles SET course = 'Bachelor of Arts'; INSERT INTO users (id, name, email) VALUES ('new', 'New', 'new@example.test');");
    expect((await client.query("SELECT approval_status FROM users WHERE id = 'new'")).rows).toEqual([{ approval_status: "onboarding_incomplete" }]);
  } finally {
    await client.close();
  }
});
