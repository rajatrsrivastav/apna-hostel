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
          router.replace("/approval");
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
        <Input
          name="course"
          list="course-options"
          placeholder="Choose or type your course"
          autoComplete="off"
          maxLength={80}
          required
        />
        <datalist id="course-options">
          <option value="ITI" />
          <option value="Diploma" />
        </datalist>
      </Field>
      <Field label="Year / वर्ष">
        <select name="year" required defaultValue="">
          <option value="" disabled>
            Choose your year
          </option>
          <option value="1st Year">1st Year</option>
          <option value="2nd Year">2nd Year</option>
          <option value="3rd Year">3rd Year</option>
          <option value="4th Year">4th Year</option>
        </select>
      </Field>
      <Field label="Branch / ब्रांच">
        <Input
          name="trade"
          placeholder="e.g. Electrician, Mechanical"
          minLength={2}
          maxLength={80}
          required
        />
      </Field>
      <Feedback error={action.error} />
      <Button size="lg" className="w-full" disabled={action.busy}>
        {action.busy ? <Spinner /> : <ArrowRight />}Let’s go / आगे बढ़ें
      </Button>
    </form>
  );
}
