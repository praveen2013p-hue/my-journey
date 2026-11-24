/**
 * Starter login-page quotes, BRIEF.md §3: "public-domain wisdom... in your
 * own short paraphrases, with attribution... plus original trading-mindset
 * lines." Every philosophical line below is my own short paraphrase, not a
 * copied translation, to stay clear of any modern translator's copyright.
 */

export interface QuoteSeed {
  text: string;
  author: string | null;
}

export const QUOTE_SEED: QuoteSeed[] = [
  // Marcus Aurelius (paraphrased)
  { text: "What stands in your way becomes the way itself.", author: "Marcus Aurelius" },
  { text: "You have power over your mind, not outside events. Know this, and you will find strength.", author: "Marcus Aurelius" },
  { text: "Waste no more time arguing what a good person should be. Be one.", author: "Marcus Aurelius" },
  { text: "The soul becomes dyed with the colour of its thoughts.", author: "Marcus Aurelius" },
  // Seneca (paraphrased)
  { text: "It is not that we have too little time, but that we waste so much of it.", author: "Seneca" },
  { text: "Luck is what happens when preparation meets the moment.", author: "Seneca" },
  { text: "We suffer more in imagination than in reality.", author: "Seneca" },
  { text: "Associate with people who are likely to improve you.", author: "Seneca" },
  // Epictetus (paraphrased)
  { text: "No one is free who is not master of themselves.", author: "Epictetus" },
  { text: "Make the best use of what is in your power, and take the rest as it happens.", author: "Epictetus" },
  { text: "It is not events that disturb people, but their judgments about events.", author: "Epictetus" },
  // Confucius / Lao Tzu (paraphrased)
  { text: "A gem cannot be polished without friction, nor a person perfected without trials.", author: "Confucius" },
  { text: "The journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
  { text: "Nature does not hurry, yet everything is accomplished.", author: "Lao Tzu" },
  { text: "A tree that fills the arms grew from the smallest shoot.", author: "Lao Tzu" },
  { text: "Knowing others is wisdom; knowing yourself is enlightenment.", author: "Lao Tzu" },
  { text: "New beginnings are often disguised as painful endings.", author: "Lao Tzu" },
  // Thiruvalluvar (paraphrased)
  { text: "Respect and support those who nourished you; return good for good, and let go of grudges.", author: "Thiruvalluvar" },
  { text: "Even the wise can be undone by a single careless word.", author: "Thiruvalluvar" },
  { text: "Rise early and work with patience, and even the sea will yield its wealth to you.", author: "Thiruvalluvar" },
  { text: "A clear mind, free of greed, is the surest road to lasting good.", author: "Thiruvalluvar" },
  // Bhagavad Gita (paraphrased)
  { text: "The disciplined act without attachment to results, and so remain steady.", author: "Bhagavad Gita" },
  { text: "A calm mind in gain and in loss is the mark of one who has truly mastered the craft.", author: "Bhagavad Gita" },
  { text: "Do your work with full effort; what follows is not fully yours to command.", author: "Bhagavad Gita" },
  { text: "The mind that is restless cannot see clearly; stillness lets understanding settle.", author: "Bhagavad Gita" },
  // Original trading-mindset lines
  { text: "Patience is a position too.", author: null },
  { text: "The market rewards process, not predictions.", author: null },
  { text: "A plan survives contact with a losing trade; hope does not.", author: null },
  { text: "Small, repeatable edges compound into results no single trade can.", author: null },
  { text: "Cut the losers quickly; let the winners argue for themselves.", author: null },
  { text: "Volume confirms conviction; price alone is just a whisper.", author: null },
  { text: "The best trade is sometimes the one you didn't take.", author: null },
  { text: "Discipline is remembering your rules after the market has tested them.", author: null },
  { text: "A Stage 2 breakout is a question the market is still answering.", author: null },
  { text: "Risk what you can lose calmly, not what you can lose quickly.", author: null },
  { text: "Every week closed is a vote; wait for the trend to win the election.", author: null },
  { text: "Sizing is strategy; everything else is commentary.", author: null },
  { text: "The chart doesn't know what you paid for it — and neither should your decisions.", author: null },
  { text: "Compounding is patient work disguised as slow work.", author: null },
  { text: "A journal is a mirror the market can't argue with.", author: null },
  { text: "Strength relative to the market matters more than strength in isolation.", author: null },
  { text: "Sectors rotate before stocks do; watch the current, not just the boat.", author: null },
  { text: "The trend is a fact; your opinion of it is not.", author: null },
  { text: "Good exits are boring. That's usually why they're good.", author: null },
  { text: "Review the losses as carefully as the wins — they teach more per trade.", author: null },
];
