## Unempluzz.ai, AI Job Aggregator
```
My 1 day project because I recently bought a Claude Pro subscription, I burned my daily session limit making this...
**This is supposed to be ran locally! There are no security considerations for this to be deployed live anywhere!!!**

Uses LLMs to web-scrape job postings and collect ones relating to the user's industry
Achieved through Apify's web scraping service and Claude's apis
```

## Features
```
-> User can save certain links to scrape, cherry picking certain job postings
-> User can also upload their resume and input certain keywords for the scraper to use
-> Job posted are optimized through: category detection & job scoring
-> User can give feedback to scoring algorithm to help detect job posting related to their field
-> "High match" category is specifically for job postings that mostly align with user's resume/keywords
-> Websites can be queried automatically at 6am daily
-> Discord webhooks for LLM token usage warnings and new job postings
```

# Initial Setup
```
npm install
npx prisma generate
```

## DB Setup
```
mkdir -p data/resumes
npx prisma db push
```

## .env Setup
```
DATABASE_URL= "file:../data/unempluzzed.db" (This project uses SQLite via Prisma as the DB)
ANTHROPIC_API_KEY=
APIFY_API_TOKEN=
DISCORD_WEBHOOK_URL=
```

## Daily scrape script
```
npx tsx scripts/daily-scrape.ts
```
