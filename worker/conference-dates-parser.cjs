const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const TIMEZONE_OFFSETS = {
  UTC: "+00:00",
  GMT: "+00:00",
  PST: "-08:00",
  PDT: "-07:00",
  MST: "-07:00",
  MDT: "-06:00",
  CST: "-06:00",
  CDT: "-05:00",
  EST: "-05:00",
  EDT: "-04:00"
};

const CANONICAL_DEADLINES = [
  {
    kind: "abstract_submission",
    name: "Abstract submission deadline",
    isHard: true,
    patterns: [/abstract submission deadline/i]
  },
  {
    kind: "paper_submission",
    name: "Paper submission deadline",
    isHard: true,
    patterns: [/\b(full paper|paper) submission deadline\b/i]
  },
  {
    kind: "reviews_released",
    name: "Reviews released",
    isHard: false,
    patterns: [/\breviews? released(?: to authors)?\b/i, /\bpaper reviews released to authors\b/i]
  },
  {
    kind: "author_response",
    name: "Author response deadline",
    isHard: true,
    patterns: [
      /\bauthor response deadline\b/i,
      /\bauthor reviewer discussion ends\b/i,
      /\bauthor, reviewer, a c - discussion ends\b/i
    ]
  },
  {
    kind: "decision_notification",
    name: "Decision notification",
    isHard: false,
    patterns: [
      /\bpaper decision notification\b/i,
      /\bauthor notification\b/i,
      /\bpaper author notifications\b/i,
      /\bfinal decisions\b/i
    ]
  },
  {
    kind: "supplementary_submission",
    name: "Supplementary materials deadline",
    isHard: true,
    patterns: [/\bsupplementary materials deadline\b/i]
  }
];

function stripHtml(input) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&raquo;/g, ">>")
    .replace(/\s+/g, " ")
    .trim();
}

function pad(number) {
  return String(number).padStart(2, "0");
}

function normalizeRawTimestamp(value) {
  const match = value.match(
    /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\s+(UTC|GMT|PST|PDT|MST|MDT|CST|CDT|EST|EDT)$/i
  );

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second, zone] = match;
  const offset = TIMEZONE_OFFSETS[zone.toUpperCase()];

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}

function parseDisplayTimestamp(displayDate) {
  const aoeMatch = displayDate.match(/^([A-Z][a-z]{2})\s+(\d{2})\s+'(\d{2})\s+\(Anywhere on Earth\)$/);

  if (aoeMatch) {
    const [, month, day, shortYear] = aoeMatch;
    const monthIndex = MONTHS.indexOf(month);

    if (monthIndex === -1) {
      throw new Error(`Unsupported month '${month}' in '${displayDate}'.`);
    }

    return new Date(Date.UTC(Number(`20${shortYear}`), monthIndex, Number(day) + 1, 11, 59, 59));
  }

  const explicitZoneMatch = displayDate.match(
    /^([A-Z][a-z]{2})\s+(\d{2})\s+'(\d{2})\s+(\d{2}):(\d{2})\s+([AP]M)\s+(UTC|GMT|PST|PDT|MST|MDT|CST|CDT|EST|EDT|[+-]\d{2})$/
  );

  if (explicitZoneMatch) {
    const [, month, day, shortYear, rawHour, minute, meridiem, zone] = explicitZoneMatch;
    const monthIndex = MONTHS.indexOf(month);

    if (monthIndex === -1) {
      throw new Error(`Unsupported month '${month}' in '${displayDate}'.`);
    }

    let hour = Number(rawHour) % 12;

    if (meridiem === "PM") {
      hour += 12;
    }

    const offset = zone.startsWith("+") || zone.startsWith("-") ? `${zone}:00` : TIMEZONE_OFFSETS[zone];

    if (!offset) {
      throw new Error(`Unsupported timezone '${zone}' in '${displayDate}'.`);
    }

    return new Date(
      `${Number(`20${shortYear}`)}-${pad(monthIndex + 1)}-${day}T${pad(hour)}:${minute}:00${offset}`
    );
  }

  throw new Error(`Unsupported official date format '${displayDate}'.`);
}

function parseConferenceDatesRows(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const parsedRows = [];
  let currentSection = null;

  for (const match of rows) {
    const rowHtml = match[1];
    const cells = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripHtml(cell[1]));

    if (cells.length === 0) {
      continue;
    }

    if (cells.length === 1) {
      currentSection = cells[0];
      continue;
    }

    if (cells[1] === "Name") {
      continue;
    }

    const label = cells[1] ?? null;
    const displayDate = cells[2] ?? null;
    const rawTimestamp = rowHtml.match(/var\s+[A-Za-z0-9_]+\s*=\s*"([^"]+)"/i)?.[1] ?? null;

    if (!label || !displayDate) {
      continue;
    }

    parsedRows.push({
      section: currentSection,
      label,
      displayDate,
      rawTimestamp
    });
  }

  return parsedRows;
}

function parseOfficialTimestamp(row) {
  const normalizedRawTimestamp = row.rawTimestamp ? normalizeRawTimestamp(row.rawTimestamp) : null;

  if (normalizedRawTimestamp) {
    return new Date(normalizedRawTimestamp);
  }

  return parseDisplayTimestamp(row.displayDate);
}

function matchCanonicalDeadline(row, includeKinds) {
  for (const deadline of CANONICAL_DEADLINES) {
    if (includeKinds && !includeKinds.includes(deadline.kind)) {
      continue;
    }

    if (deadline.patterns.some((pattern) => pattern.test(row.label))) {
      return {
        ...deadline,
        notes: `Pulled from the official dates page row '${row.label}'.`
      };
    }
  }

  return null;
}

function extractCanonicalDeadlines(html, config) {
  const rows = parseConferenceDatesRows(html);
  const scopedRows = config.targetSection
    ? rows.filter((row) => row.section === config.targetSection)
    : rows;
  const seenKinds = new Set();
  const deadlines = [];

  for (const row of scopedRows) {
    const matchedDeadline = matchCanonicalDeadline(row, config.includeKinds);

    if (!matchedDeadline || seenKinds.has(matchedDeadline.kind)) {
      continue;
    }

    deadlines.push({
      name: matchedDeadline.name,
      kind: matchedDeadline.kind,
      dueAt: parseOfficialTimestamp(row).toISOString(),
      notes: matchedDeadline.notes,
      isHard: matchedDeadline.isHard,
      sourceLabel: row.label,
      section: row.section
    });
    seenKinds.add(matchedDeadline.kind);
  }

  const missingKinds = (config.includeKinds ?? []).filter((kind) => !seenKinds.has(kind));

  if (missingKinds.length > 0) {
    throw new Error(
      `Missing canonical milestones ${missingKinds.join(", ")} in ${config.venueSlug}/${config.sourceKey}.`
    );
  }

  return {
    deadlines,
    rows: scopedRows
  };
}

module.exports = {
  extractCanonicalDeadlines
};
