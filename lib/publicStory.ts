// Server-side read of one public story (migration 00046), for app/s/[slug].
//
// Runs on the server with the anon key - the same key the browser bundle
// already ships - so it can only ever see what the anon policies allow:
// a story that is public, approved and past its publish_after, and the
// public-bucket paths of its copied photos. Nothing else is reachable from
// here, by construction. No caching: unpublishing must take effect at once.

export type PublicStory = {
  title: string;
  body: string;
  placeLabel: string | null;
  publishedAt: string | null;
  photoUrls: string[];
};

const SLUG = /^[0-9a-f]{12}$/;

export function isValidSlug(slug: string): boolean {
  return SLUG.test(slug);
}

export async function loadPublicStory(slug: string): Promise<PublicStory | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !isValidSlug(slug)) return null;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  try {
    const postRes = await fetch(
      `${url}/rest/v1/posts?select=id,title,body,place_label,published_at&public_slug=eq.${slug}&limit=1`,
      { headers, cache: "no-store" }
    );
    if (!postRes.ok) return null;
    const [post] = (await postRes.json()) as {
      id: string;
      title: string;
      body: string;
      place_label: string | null;
      published_at: string | null;
    }[];
    if (!post) return null;

    const photoRes = await fetch(
      `${url}/rest/v1/post_photos?select=public_path,position&post_id=eq.${post.id}&public_path=not.is.null&order=position`,
      { headers, cache: "no-store" }
    );
    const photos = photoRes.ok ? ((await photoRes.json()) as { public_path: string }[]) : [];

    return {
      title: post.title,
      body: post.body,
      placeLabel: post.place_label,
      publishedAt: post.published_at,
      photoUrls: photos.map(
        (p) => `${url}/storage/v1/object/public/public-stories/${p.public_path.split("/").map(encodeURIComponent).join("/")}`
      ),
    };
  } catch {
    return null;
  }
}

/** Open-graph description: the first ~150 characters of the story. */
export function excerpt(body: string, max = 150): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
