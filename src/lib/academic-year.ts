export function academicYearStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return monthNumber >= 8 ? year : year - 1;
}

export function academicYearLabel(startYear: number) {
  return `Aug ${startYear} – Jul ${startYear + 1}`;
}
