import type { Metadata } from "next";
import { headers } from "next/headers";
import { SovevBrand, SovevScreen } from "@/components/sovev/SovevScreen";
import { excerpt, loadPublicStory } from "@/lib/publicStory";
import { formatDate } from "@/lib/format";
import { strings } from "@/lib/strings";

// The open blog (migration 00046): the one page in OurTrip anyone with the
// link can read, without signing in. Server-rendered so a WhatsApp link
// preview shows the story's title and first photo. Never indexed: the link is
// for people the family sends it to, not for search engines (DESIGN-sharing
// §1 - a public page announcing a family is abroad for months is information
// a burglar would like).

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const story = await loadPublicStory(slug);
  const base = await origin();
  const robots = { index: false, follow: false };
  if (!story) {
    return { title: { absolute: strings.sovev.name }, robots };
  }
  const description = excerpt(story.body) || strings.publicStory.description;
  const image = story.photoUrls[0] ?? `${base}/sovev/og.jpg`;
  return {
    metadataBase: new URL(base),
    title: { absolute: `${story.title} · ${strings.sovev.name}` },
    description,
    robots,
    openGraph: {
      title: story.title,
      description,
      siteName: strings.sovev.name,
      locale: "he_IL",
      type: "article",
      images: [{ url: image }],
    },
  };
}

export default async function PublicStoryPage({ params }: Props) {
  const { slug } = await params;
  const story = await loadPublicStory(slug);

  return (
    <SovevScreen>
      <article className="mx-auto max-w-2xl space-y-5 px-4 pt-6 pb-16">
        <SovevBrand subtitle={strings.sovev.tagline} />
        {!story ? (
          <div className="space-y-2 rounded-[22px] border-2 border-dashed border-sv-line p-8 text-center">
            <h1 className="sovev-display text-2xl font-extrabold">{strings.publicStory.notFound}</h1>
            <p className="text-sv-ink-soft">{strings.publicStory.notFoundBody}</p>
          </div>
        ) : (
          <>
            {story.photoUrls[0] && (
              // eslint-disable-next-line @next/next/no-img-element -- public bucket URL, already sized on upload
              <img
                src={story.photoUrls[0]}
                alt=""
                className="aspect-[4/3] w-full rounded-[22px] border-2 border-sv-ink object-cover"
              />
            )}
            <header className="space-y-1">
              <p className="text-[13px] text-sv-ink-soft">
                {story.publishedAt && <span dir="ltr">{formatDate(story.publishedAt.slice(0, 10))}</span>}
                {story.placeLabel && <span> · {story.placeLabel}</span>}
              </p>
              <h1 className="sovev-display text-[32px] font-extrabold leading-[42px]">{story.title}</h1>
            </header>
            {story.body && (
              <div className="whitespace-pre-wrap text-[17px] leading-[1.8] [text-wrap:pretty]">{story.body}</div>
            )}
            {story.photoUrls.length > 1 && (
              <ul className="grid grid-cols-2 gap-2">
                {story.photoUrls.slice(1).map((src) => (
                  <li key={src} className="overflow-hidden rounded-2xl border-2 border-sv-line">
                    {/* eslint-disable-next-line @next/next/no-img-element -- public bucket URL */}
                    <img src={src} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <footer className="border-t-2 border-dashed border-sv-line pt-4 text-center text-sv-ink-soft">
          {strings.publicStory.footer}
        </footer>
      </article>
    </SovevScreen>
  );
}
