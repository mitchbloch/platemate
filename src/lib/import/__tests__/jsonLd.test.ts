import { describe, expect, it } from "vitest";
import { extractRecipeJsonLd, extractSocialPosting } from "../jsonLd";

const PAGE = "https://www.example.com/recipes/lentil-soup/";
const ld = (data: unknown, attrs = 'type="application/ld+json"') => `<script ${attrs}>${typeof data === "string" ? data : JSON.stringify(data)}</script>`;

const soup = {
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Lentil Soup",
  recipeIngredient: ["1 cup lentils", "4 cups stock"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Simmer 30 minutes." }],
};

describe("extractRecipeJsonLd", () => {
  it("reads a top-level Recipe", () => {
    const result = extractRecipeJsonLd(ld(soup), PAGE);
    expect(result?.recipe).toMatchObject({ name: "Lentil Soup", recipeIngredient: ["1 cup lentils", "4 cups stock"], recipeInstructions: ["Simmer 30 minutes."] });
    expect(result?.ingredientCount).toBe(2);
  });

  it("finds a Recipe inside @graph (Yoast / WP Recipe Maker)", () => {
    const html = ld({ "@context": "https://schema.org", "@graph": [{ "@type": "WebPage" }, { "@type": "Person", name: "x" }, soup] });
    expect(extractRecipeJsonLd(html, PAGE)?.recipe.name).toBe("Lentil Soup");
  });

  it("matches @type arrays and prefixed types", () => {
    expect(extractRecipeJsonLd(ld({ ...soup, "@type": ["Recipe", "NewsArticle"] }), PAGE)).not.toBeNull();
    expect(extractRecipeJsonLd(ld({ ...soup, "@type": "schema:Recipe" }), PAGE)).not.toBeNull();
    expect(extractRecipeJsonLd(ld({ ...soup, "@type": "http://schema.org/Recipe" }), PAGE)).not.toBeNull();
  });

  it("finds recipes in mainEntity and ItemList wrappers", () => {
    expect(extractRecipeJsonLd(ld({ "@type": "WebPage", mainEntity: soup }), PAGE)).not.toBeNull();
    expect(extractRecipeJsonLd(ld({ "@type": "ItemList", itemListElement: [{ "@type": "ListItem", item: soup }] }), PAGE)).not.toBeNull();
    expect(extractRecipeJsonLd(ld([{ "@type": "Organization" }, soup]), PAGE)).not.toBeNull();
  });

  it("survives a malformed block next to a valid one", () => {
    const html = ld("{ not json") + ld(soup);
    expect(extractRecipeJsonLd(html, PAGE)?.recipe.name).toBe("Lentil Soup");
  });

  it("tolerates comment/CDATA wrappers, unquoted type attributes and raw newlines in strings", () => {
    const raw = `<!--${JSON.stringify(soup).replace("Simmer 30 minutes.", "Simmer\n30 minutes.")}-->`;
    expect(extractRecipeJsonLd(ld(raw, "type=application/ld+json"), PAGE)?.recipe.recipeInstructions).toEqual(["Simmer 30 minutes."]);
    expect(extractRecipeJsonLd(ld(`<![CDATA[${JSON.stringify(soup)}]]>`), PAGE)).not.toBeNull();
  });

  it("treats a Recipe without ingredients or instructions as absent", () => {
    expect(extractRecipeJsonLd(ld({ ...soup, recipeIngredient: [] }), PAGE)).toBeNull();
    expect(extractRecipeJsonLd(ld({ ...soup, recipeInstructions: [] }), PAGE)).toBeNull();
    expect(extractRecipeJsonLd(ld({ "@type": "Article", name: "x" }), PAGE)).toBeNull();
    expect(extractRecipeJsonLd("<p>no structured data</p>", PAGE)).toBeNull();
  });

  it("picks the recipe this page is about, else the most complete one", () => {
    const other = { ...soup, name: "Related Bread", url: "https://example.com/recipes/bread", recipeIngredient: ["a", "b", "c", "d"] };
    const self = { ...soup, url: "https://example.com/recipes/lentil-soup" };
    expect(extractRecipeJsonLd(ld([other, self]), PAGE)?.recipe.name).toBe("Lentil Soup");
    expect(extractRecipeJsonLd(ld([soup, { ...other, url: undefined }]), PAGE)?.recipe.name).toBe("Related Bread");
  });

  it("cleans HTML and entities inside strings (incl. double-encoded)", () => {
    const html = ld({
      ...soup,
      name: "Mac &amp; Cheese",
      recipeIngredient: ["2&frac12; cups <b>shredded</b> cheddar", "1 &amp;#189; tsp salt"],
      recipeInstructions: "<p>Boil pasta.</p><p>Stir in cheese &amp; serve.</p>",
    });
    const r = extractRecipeJsonLd(html, PAGE)?.recipe;
    expect(r?.name).toBe("Mac & Cheese");
    expect(r?.recipeIngredient).toEqual(["2½ cups shredded cheddar", "1 ½ tsp salt"]);
    expect(r?.recipeInstructions).toEqual(["Boil pasta.", "Stir in cheese & serve."]);
  });

  it("keeps HowToSection groups and flattens HowToStep", () => {
    const html = ld({
      ...soup,
      recipeInstructions: [
        { "@type": "HowToSection", name: "Sauce", itemListElement: [{ "@type": "HowToStep", text: "Whisk." }] },
        { "@type": "HowToSection", name: "Kebabs", itemListElement: [{ "@type": "HowToStep", name: "Bake 20 min." }] },
      ],
    });
    expect(extractRecipeJsonLd(html, PAGE)?.recipe.recipeInstructions).toEqual([
      { section: "Sauce", steps: ["Whisk."] },
      { section: "Kebabs", steps: ["Bake 20 min."] },
    ]);
  });

  it("prunes to recipe fields and keeps site nutrition", () => {
    const html = ld({
      ...soup,
      recipeYield: ["4", "4 servings"],
      totalTime: "PT45M",
      author: [{ "@type": "Person", name: "Melissa Clark" }],
      nutrition: { "@type": "NutritionInformation", calories: "320 kcal", cholesterolContent: "15 mg", bogus: "x" },
      aggregateRating: { ratingValue: 4.8 },
      review: [{ reviewBody: "so good".repeat(500) }],
      video: { contentUrl: "https://x/v.mp4" },
    });
    const r = extractRecipeJsonLd(html, PAGE)!.recipe;
    expect(r).toMatchObject({ recipeYield: "4, 4 servings", totalTime: "PT45M", author: "Melissa Clark", nutrition: { calories: "320 kcal", cholesterolContent: "15 mg" } });
    expect(r).not.toHaveProperty("review");
    expect(r).not.toHaveProperty("aggregateRating");
    expect(r).not.toHaveProperty("video");
    expect(r.nutrition).not.toHaveProperty("bogus");
  });

  it("resolves image as string, ImageObject or array to an absolute URL", () => {
    expect(extractRecipeJsonLd(ld({ ...soup, image: "/img/soup.jpg" }), PAGE)?.imageUrl).toBe("https://www.example.com/img/soup.jpg");
    expect(extractRecipeJsonLd(ld({ ...soup, image: { "@type": "ImageObject", url: "https://cdn.x/a.jpg" } }), PAGE)?.imageUrl).toBe("https://cdn.x/a.jpg");
    expect(extractRecipeJsonLd(ld({ ...soup, image: ["", "https://cdn.x/b.jpg"] }), PAGE)?.imageUrl).toBe("https://cdn.x/b.jpg");
    expect(extractRecipeJsonLd(ld({ ...soup, image: "javascript:alert(1)" }), PAGE)?.imageUrl).toBeNull();
    expect(extractRecipeJsonLd(ld(soup), PAGE)?.imageUrl).toBeNull();
  });

  it("finds recipe data far past the old 60k-character cut (regression)", () => {
    // BBC Good Food / Bon Appétit: cleaned HTML is 93–112k and the last
    // ingredients sat past the cut. JSON-LD placement doesn't matter now.
    const filler = `<div class="content">${"<p>Story about this soup. </p>".repeat(4_000)}</div>`;
    const lastIngredient = "Fresh parsley, to serve";
    const html = filler + ld({ ...soup, recipeIngredient: [...soup.recipeIngredient, lastIngredient] });
    expect(html.length).toBeGreaterThan(100_000);
    expect(extractRecipeJsonLd(html, PAGE)?.recipe.recipeIngredient).toContain(lastIngredient);
  });
});

describe("extractSocialPosting", () => {
  const PIN = "https://www.pinterest.com/pin/1/";
  const posting = {
    "@type": "SocialMediaPosting",
    articleBody: "Cozy &amp; quick <b>lentil</b> soup",
    author: { "@type": "Person", name: "Jenn Fishkind" },
    sharedContent: { "@type": "WebPage", url: "https://example.com/soup/?utm_source=pinterest" },
  };

  it("reads the linked page, description and author", () => {
    expect(extractSocialPosting(ld(posting), PIN)).toEqual({
      linkedUrl: "https://example.com/soup/?utm_source=pinterest",
      description: "Cozy & quick lentil soup",
      author: "Jenn Fishkind",
    });
  });

  it("finds postings inside @graph and with @type arrays", () => {
    expect(extractSocialPosting(ld({ "@graph": [{ "@type": "WebPage" }, posting] }), PIN)?.author).toBe("Jenn Fishkind");
    expect(extractSocialPosting(ld({ ...posting, "@type": ["SocialMediaPosting", "CreativeWork"] }), PIN)?.author).toBe("Jenn Fishkind");
  });

  it("ignores non-http links and missing fields", () => {
    expect(extractSocialPosting(ld({ "@type": "SocialMediaPosting", sharedContent: { url: "javascript:alert(1)" } }), PIN)).toEqual({
      linkedUrl: null,
      description: "",
      author: null,
    });
    expect(extractSocialPosting(ld({ "@type": "Recipe" }), PIN)).toBeNull();
  });
});
