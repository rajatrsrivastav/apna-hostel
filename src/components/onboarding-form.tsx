"use client";
import { useRouter } from "next/navigation";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { api, Field, Feedback, Spinner, useAction } from "./form-kit";
import { ArrowRight } from "lucide-react";
export function OnboardingForm({ name }: { name: string }) {
  const action = useAction(),
    router = useRouter();
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        action.run(async () => {
          await api("/api/profile", Object.fromEntries(form));
          router.push("/dashboard");
          router.refresh();
        });
      }}
    >
      <Field label="Full name / पूरा नाम">
        <Input
          name="fullName"
          autoComplete="name"
          defaultValue={name}
          minLength={2}
          maxLength={100}
          required
        />
      </Field>
      <Field label="Mobile number / मोबाइल नंबर">
        <Input
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="10-digit mobile number"
          pattern="[6-9][0-9]{9}"
          maxLength={10}
          required
        />
      </Field>
      <Field label="Course / कोर्स">
        <select name="course" required defaultValue="">
          <option value="" disabled>
            Choose your course
          </option>
          <option>ITI</option>
          <option>Diploma</option>
        </select>
      </Field>
      <Field label="Branch or trade / ट्रेड">
        <Input
          name="trade"
          placeholder="e.g. Electrician, Mechanical"
          minLength={2}
          maxLength={80}
          required
        />
      </Field>
      <Field label="Year / Semester">
        <select name="studyYear" required defaultValue="">
          <option value="" disabled>
            Choose year or semester
          </option>
          <optgroup label="Year">
            {[1, 2, 3].map((n) => (
              <option key={n}>Year {n}</option>
            ))}
          </optgroup>
          <optgroup label="Semester">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n}>Semester {n}</option>
            ))}
          </optgroup>
        </select>
      </Field>
      <Feedback error={action.error} />
      <Button size="lg" className="w-full" disabled={action.busy}>
        {action.busy ? <Spinner /> : <ArrowRight />}Let’s go / आगे बढ़ें
      </Button>
    </form>
  );
}
