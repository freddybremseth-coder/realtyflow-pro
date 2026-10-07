import {
  CORPORATE_DECISION_NOTE_BOOKING_URL,
  DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE,
  decisionNoteSummaryLines,
  firstName,
  type CorporateDecisionNoteReport,
} from "@/lib/corporate-decision-note";

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function field(report: CorporateDecisionNoteReport, key: keyof typeof DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE) {
  const value = (report as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim()
    ? value.trim()
    : String(DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE[key] || "").trim();
}

function tokens(report: CorporateDecisionNoteReport, pdfAttached: boolean) {
  return {
    "{{company}}": report.company_name,
    "{{first_name}}": firstName(report.contact_name),
    "{{pdf_status}}": pdfAttached
      ? "PDF-en ligger vedlagt og er laget for å kunne brukes som et internt arbeidsdokument i ledelsen eller styret."
      : "Hovedtallene står nedenfor. PDF-vedlegget kunne ikke opprettes automatisk, så saken er samtidig markert for manuell oppfølging hos oss.",
  };
}

export function renderCorporateDecisionEmailTemplate(
  value: string,
  report: CorporateDecisionNoteReport,
  pdfAttached: boolean,
) {
  let output = String(value || "");
  for (const [token, replacement] of Object.entries(tokens(report, pdfAttached))) {
    output = output.split(token).join(replacement);
  }
  return output;
}

export function corporateDecisionEmailSubject(report: CorporateDecisionNoteReport, pdfAttached = true) {
  return renderCorporateDecisionEmailTemplate(
    field(report, "email_subject_template"),
    report,
    pdfAttached,
  );
}

export function corporateDecisionEmailText(report: CorporateDecisionNoteReport, pdfAttached: boolean) {
  const first = firstName(report.contact_name);
  const summary = decisionNoteSummaryLines(report).map((line) => `– ${line}`).join("\n");
  const intro = renderCorporateDecisionEmailTemplate(field(report, "email_intro"), report, pdfAttached);
  const valueMessage = renderCorporateDecisionEmailTemplate(field(report, "email_value_message"), report, pdfAttached);
  const nextStep = renderCorporateDecisionEmailTemplate(field(report, "email_next_step"), report, pdfAttached);
  const replyPrompt = renderCorporateDecisionEmailTemplate(field(report, "email_reply_prompt"), report, pdfAttached);
  const cta = field(report, "email_cta_label");
  const signatureName = field(report, "signature_name");
  const signatureTitle = field(report, "signature_title");
  const signatureBrand = field(report, "signature_brand");

  return `Hei ${first},

${intro}

${valueMessage}

Kort oppsummert:
${summary}

Viktig: hotellalternativet er ikke behandlet som en automatisk besparelse, og verdiutviklingen er et scenario – ikke en prognose.

${nextStep}

${cta}:
${CORPORATE_DECISION_NOTE_BOOKING_URL}

${replyPrompt}

Vennlig hilsen
${signatureName}
${signatureTitle}
${signatureBrand}

${report.disclaimer || DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE.disclaimer}`;
}

export function corporateDecisionEmailHtml(report: CorporateDecisionNoteReport, pdfAttached: boolean) {
  const first = firstName(report.contact_name);
  const summaryItems = decisionNoteSummaryLines(report)
    .map((line) => `<li style="margin:0 0 9px 0">${escapeHtml(line)}</li>`)
    .join("");
  const intro = renderCorporateDecisionEmailTemplate(field(report, "email_intro"), report, pdfAttached);
  const valueMessage = renderCorporateDecisionEmailTemplate(field(report, "email_value_message"), report, pdfAttached);
  const nextStep = renderCorporateDecisionEmailTemplate(field(report, "email_next_step"), report, pdfAttached);
  const replyPrompt = renderCorporateDecisionEmailTemplate(field(report, "email_reply_prompt"), report, pdfAttached);
  const cta = field(report, "email_cta_label");
  const signatureName = field(report, "signature_name");
  const signatureTitle = field(report, "signature_title");
  const signatureBrand = field(report, "signature_brand");
  const corporateLabel = field(report, "corporate_label");
  const logoUrl = field(report, "logo_url");

  return `<!doctype html>
<html lang="no">
<body style="margin:0;background:#f4f2ed;font-family:Arial,Helvetica,sans-serif;color:#17242a">
  <div style="max-width:700px;margin:0 auto;padding:28px 16px">
    <div style="background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #dfe3df">
      <div style="padding:24px 30px 20px;border-bottom:1px solid #e7e9e5;background:#fbfaf7">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:18px">
          <img src="${escapeHtml(logoUrl)}" alt="Zen Eco Homes" style="display:block;max-width:210px;max-height:52px;width:auto;height:auto" />
          <span style="display:inline-block;border:1px solid #b58b43;border-radius:999px;padding:7px 11px;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:#765821;font-weight:700">${escapeHtml(corporateLabel)}</span>
        </div>
      </div>

      <div style="padding:30px">
        <div style="font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:#8b6a31;font-weight:700;margin-bottom:9px">Første vurdering</div>
        <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.13;margin:0 0 20px;color:#17242a">Beslutningsgrunnlag for ${escapeHtml(report.company_name)}</h1>

        <p style="font-size:16px;line-height:1.65;margin:0 0 18px">Hei ${escapeHtml(first)},</p>
        <p style="font-size:16px;line-height:1.65;margin:0 0 18px">${escapeHtml(intro)}</p>

        <div style="border-left:4px solid #b58b43;background:#faf7f0;border-radius:0 12px 12px 0;padding:17px 18px;margin:22px 0">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#765821;font-weight:700;margin-bottom:7px">Hva vurderingen skal hjelpe dere med</div>
          <p style="font-size:15px;line-height:1.65;margin:0;color:#37474d">${escapeHtml(valueMessage)}</p>
        </div>

        <div style="background:#edf3f0;border-radius:14px;padding:20px;margin:22px 0">
          <div style="font-weight:700;font-size:16px;margin-bottom:11px">Kort oppsummert</div>
          <ul style="padding-left:20px;margin:0;font-size:15px;line-height:1.55">${summaryItems}</ul>
        </div>

        <p style="font-size:14px;line-height:1.6;margin:0 0 20px;color:#536268"><strong>Viktig:</strong> hotellalternativet er ikke behandlet som en automatisk besparelse, og verdiutviklingen er et scenario – ikke en prognose.</p>

        <p style="font-size:16px;line-height:1.65;margin:0 0 20px">${escapeHtml(nextStep)}</p>

        <div style="margin:26px 0 24px">
          <a href="${CORPORATE_DECISION_NOTE_BOOKING_URL}" style="display:inline-block;background:#17242a;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:9px">${escapeHtml(cta)}</a>
        </div>

        <p style="font-size:15px;line-height:1.65;margin:0 0 24px">${escapeHtml(replyPrompt)}</p>

        <p style="font-size:15px;line-height:1.55;margin:0">
          Vennlig hilsen<br>
          <strong>${escapeHtml(signatureName)}</strong><br>
          ${escapeHtml(signatureTitle)}<br>
          ${escapeHtml(signatureBrand)}
        </p>
      </div>
    </div>
    <p style="font-size:11px;line-height:1.55;color:#788287;margin:13px 8px 0">${escapeHtml(report.disclaimer || DEFAULT_CORPORATE_DECISION_NOTE_TEMPLATE.disclaimer)}</p>
  </div>
</body>
</html>`;
}
