// Improved Fake AI service for testing
export async function summarizeAndTag(text) {
  // simulate API delay
  await new Promise((r) => setTimeout(r, 800));

  // Clean the text (remove extra spaces/newlines)
  const cleanText = text.replace(/\s+/g, " ").trim();

  // Generate a human-like short summary
  let summary;
  if (cleanText.length <= 80) {
    summary = cleanText; // already short
  } else {
    const sentences = cleanText.split(/(?<=[.?!])\s+/);
    summary =
      sentences[0].length <= 100
        ? sentences[0]
        : cleanText.slice(0, 100) + "...";
  }

  // Generate context-aware tags (based on keywords in text)
  const keywords = cleanText.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];

  const uniqueKeywords = [...new Set(keywords)];
  const tags = uniqueKeywords
    .slice(0, 5) // first few relevant words
    .map((word) => word.replace(/[^a-z]/g, ""));

  // Fallback if not enough tags
  while (tags.length < 3) {
    tags.push("note");
  }

  return { summary, tags };
}
