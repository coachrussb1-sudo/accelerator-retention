export const KIT_FORM_ID = "10247458";
export const MENTORSHIP_URL = "https://calendly.com/coachrussb1/new-meeting";
export const SITE_URL = "https://triumfitcoaching.com";
export const IG_URL = "https://instagram.com/russ_b1";
export const HOWTO_VIDEO = "./assets/export-howto.mp4";
export const HOWTO_POSTER = "./assets/export-howto-poster.jpg";

export function kitSubscribeUrl(): string {
  return `https://app.kit.com/forms/${KIT_FORM_ID}/subscriptions`;
}

export type KitPayload = {
  email: string;
  score: string;
  stage: string;
  biggestLeak: string;
  biggestFix: string;
  shareUrl: string;
};

export function kitEntries(fields: KitPayload): Array<[string, string]> {
  return [
    ["email_address", fields.email],
    ["first_name", ""],
    ["fields[score]", fields.score],
    ["fields[stage]", fields.stage],
    ["fields[biggest_leak]", fields.biggestLeak],
    ["fields[biggest_fix]", fields.biggestFix],
    ["fields[share_url]", fields.shareUrl],
  ];
}

export function postKitViaHiddenIframe(entries: Array<[string, string]>): Promise<void> {
  return new Promise((resolve) => {
    const url = kitSubscribeUrl();
    const frameName = `kit-subscribe-${Date.now()}`;
    const iframe = document.createElement("iframe");
    iframe.name = frameName;
    iframe.title = "Kit subscribe";
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.display = "none";
    const form = document.createElement("form");
    form.method = "POST";
    form.action = url;
    form.target = frameName;
    form.acceptCharset = "UTF-8";
    form.style.display = "none";
    for (const [name, value] of entries) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.append(iframe, form);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      form.remove();
      window.setTimeout(() => iframe.remove(), 4000);
      resolve();
    };
    iframe.addEventListener("load", finish, { once: true });
    form.submit();
    window.setTimeout(finish, 1800);
  });
}

export async function emailBreakdown(fields: KitPayload): Promise<{ ok: boolean; message: string }> {
  if (!fields.email.includes("@") || fields.email.trim().length < 5) {
    return { ok: false, message: "Need a real email." };
  }
  const url = kitSubscribeUrl();
  const entries = kitEntries(fields);
  const body = new FormData();
  for (const [name, value] of entries) body.append(name, value);
  try {
    const response = await fetch(url, { method: "POST", body, mode: "cors" });
    if (response.ok) return { ok: true, message: "Breakdown is headed to your inbox." };
  } catch {
    await postKitViaHiddenIframe(entries);
    return { ok: true, message: "Breakdown is headed to your inbox." };
  }
  await postKitViaHiddenIframe(entries);
  return { ok: true, message: "Breakdown is headed to your inbox." };
}
