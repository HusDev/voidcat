import type { ReactNode } from "react";
import { Logo } from "../components/Logo";

/**
 * Voidcat Cloud's Privacy Policy and Terms, in plain words, at #/privacy and #/terms (readable without signing in).
 * Who runs the service, how to reach them and which law applies are placeholders until Hussein fills them in; a
 * lawyer checks both pages before payments start.
 */

export const LEGAL_PAGES = ["#/privacy", "#/terms"] as const;
const UPDATED = "18 October 2026";
const OPERATOR = "[OPERATOR NAME]";
const CONTACT = "[CONTACT EMAIL]";
const LAW = "[COUNTRY]";

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-ground px-6 py-12 text-ink">
      <article className="mx-auto flex max-w-[68ch] flex-col gap-4 text-[15px] leading-relaxed [&_h2]:mt-4 [&_h2]:mb-0 [&_h2]:text-[18px] [&_h2]:font-semibold [&_li]:mt-1 [&_p]:m-0 [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-5">
        <a href="#/" className="flex items-center gap-2 text-[13px] text-ink-2 no-underline hover:text-ink">
          <Logo size={22} onPage /> Voidcat Cloud
        </a>
        <h1 className="m-0 text-[34px] font-light">{title}</h1>
        <p className="text-[13px] text-ink-2">Last updated {UPDATED}.</p>
        {children}
        <p className="mt-6 flex gap-4 text-[13px] text-ink-2">
          <a href="#/privacy" className="text-link underline">
            Privacy Policy
          </a>
          <a href="#/terms" className="text-link underline">
            Terms
          </a>
          <a href="#/" className="text-link underline">
            Back to Voidcat
          </a>
        </p>
      </article>
    </main>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy Policy">
      <p>
        Voidcat Cloud is run by {OPERATOR}. Write to {CONTACT} about anything on this page.
      </p>

      <h2>What we can't see</h2>
      <p>
        Your documents, their file names and titles, your folders, the facts Voidcat finds and the text of every page are locked on your own device before
        they're uploaded, with a key only you have (your recovery key). We store them locked and can't open them. We can't recover them for you either: if
        you lose your recovery key and every device that knows it, your cloud library can't be opened by anyone.
      </p>

      <h2>What we do store</h2>
      <ul>
        <li>Your sign-in: your email address, and your name and photo if you sign in with Google. Firebase Authentication (Google) keeps this.</li>
        <li>Your locked records and files, their sizes, and when each one changed.</li>
        <li>How many times you used "Read now" this month, to apply the monthly limit.</li>
        <li>Google's own service logs, which include IP addresses and the time of each request. We don't log what you read or upload.</li>
      </ul>

      <h2>"Read now" in the cloud</h2>
      <p>
        Only when you click it. Your browser reads the text and hides names, addresses, ID numbers and other private details itself, replacing them with
        placeholders. Only that masked text goes to Gemini on Google Cloud's Vertex AI in Belgium, which suggests a title, a folder and facts. Your browser
        puts the real values back. We don't keep the text, and Google doesn't use it to train its models.
      </p>
      <p>
        The privacy model that does the masking is downloaded once from Hugging Face, and the reading of scans uses language files from jsDelivr. Both see
        your IP address when your browser fetches them, nothing else.
      </p>

      <h2>Where your data is</h2>
      <p>
        In Google Cloud's europe-west1 region (Belgium): the database, the files, the app and Gemini. Sign-in is handled by Firebase Authentication, a Google
        service that may process your email outside the EU under Google's data protection terms.
      </p>

      <h2>Who else is involved</h2>
      <p>Google Cloud and Firebase (hosting, storage, sign-in, Gemini). No one else gets your data. There are no ads, trackers or analytics.</p>

      <h2>In your browser</h2>
      <p>
        Your browser keeps your sign-in, a locked copy of your library so it opens fast, and your library's key in a form that can't be copied out of the
        browser. "Forget this browser" in Settings removes the key. Voidcat locks the library after 30 minutes without use.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Until you delete it. Settings → Cloud account → Delete my account removes your records, files, read count and sign-in at once. What's on your own
        devices stays there. Export everything first if you want a copy.
      </p>

      <h2>Your rights</h2>
      <p>
        You can get a copy of your data (Export everything), correct it, and delete it, all in the app. For anything else, write to {CONTACT}. You can also
        complain to your country's data protection authority.
      </p>

      <h2>Children</h2>
      <p>Voidcat Cloud isn't meant for anyone under 16.</p>

      <h2>Changes</h2>
      <p>If this policy changes, the date at the top changes, and important changes are announced in the app first.</p>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms">
      <p>
        These terms are between you and {OPERATOR}, who runs Voidcat Cloud. Using Voidcat Cloud means you accept them. The Voidcat app on your Mac is free and
        open source (MIT) and doesn't need an account.
      </p>

      <h2>The service</h2>
      <p>
        Voidcat Cloud keeps a locked copy of your Voidcat library so you can open it in a browser, syncs it with your Mac, and can file new documents with
        "Read now". It's new: it runs as is, and it may change while it grows. Paid plans aren't live yet; until they are, the cloud is free to try.
      </p>

      <h2>Your recovery key</h2>
      <p>
        Your library is locked with a key only you hold. Keep your recovery key safe. If you lose it and every device that knows it, nobody, including us, can
        open your cloud library.
      </p>

      <h2>Your content</h2>
      <p>Your documents stay yours. We only store them, locked, to run the service for you, and we never sell or share them.</p>

      <h2>Fair use</h2>
      <ul>
        <li>Use Voidcat Cloud only for your own documents and only lawfully.</li>
        <li>"Read now" has a monthly limit (300 reads). Don't try to get around it or use the service to reach Gemini for anything else.</li>
        <li>Don't try to reach other people's data or disrupt the service.</li>
      </ul>
      <p>We may suspend an account that breaks these rules.</p>

      <h2>Ending</h2>
      <p>
        You can delete your account at any time in Settings. If we ever stop Voidcat Cloud, we'll tell you at least 30 days before, so you can export
        everything. Your Mac keeps its own library either way.
      </p>

      <h2>Liability</h2>
      <p>
        We work hard to keep the service safe and available, but we can't promise it will never fail. As far as the law allows, we're not liable for indirect
        losses, and our total liability is limited to what you paid us in the last 12 months. Nothing here limits rights you have as a consumer.
      </p>

      <h2>Law</h2>
      <p>These terms follow the law of {LAW}. Write to {CONTACT} first if something goes wrong; most things can be fixed quickly.</p>
    </Page>
  );
}

/** The legal page for the current address, if it is one. */
export function legalPage(hash: string) {
  if (hash.startsWith("#/privacy")) return <Privacy />;
  if (hash.startsWith("#/terms")) return <Terms />;
  return null;
}
