const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

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
    patterns: [
      /\b(full paper|paper|main conference) submission deadline\b/i,
      /\bsubmission and supplementary materials deadline\b/i
    ]
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
      /\bauthor rebuttals? due\b/i,
      /\brebuttal deadline\b/i,
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
      /\bpaper decisions\b/i,
      /\bmain conference paper decisions\b/i,
      /\bfinal decisions\b/i
    ]
  },
  {
    kind: "supplementary_submission",
    name: "Supplementary materials deadline",
    isHard: true,
    patterns: [/\bsupplementary materials deadline\b/i, /\bsupplemental materials deadline\b/i]
  }
];

const ACL_IMPORTANT_DATES = [
  {
    kind: "paper_submission",
    name: "Paper submission deadline",
    isHard: true,
    patterns: [/submission deadline \(all papers are submitted to arr\)/i]
  },
  {
    kind: "reviews_released",
    name: "Reviews released",
    isHard: false,
    patterns: [/\barr reviews .* available to authors\b/i]
  },
  {
    kind: "decision_notification",
    name: "Decision notification",
    isHard: false,
    patterns: [/\bnotification of acceptance\b/i]
  }
];

const EMNLP_IMPORTANT_DATES = [
  {
    kind: "paper_submission",
    name: "Paper submission deadline",
    isHard: true,
    patterns: [/\barr submission deadline\b/i]
  },
  {
    kind: "author_response",
    name: "Author response deadline",
    isHard: true,
    patterns: [/\bauthor response and author-reviewer discussion\b/i]
  },
  {
    kind: "decision_notification",
    name: "Decision notification",
    isHard: false,
    patterns: [/\bnotification of acceptance\b/i]
  }
];

function stripHtml(input) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
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

  const dateOnlyMatch = displayDate.match(/^([A-Z][a-z]{2})\s+(\d{2})\s+'(\d{2})$/);

  if (dateOnlyMatch) {
    const [, month, day, shortYear] = dateOnlyMatch;
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

function parseDateOnlyWithAoe(dateText) {
  const match = dateText.match(/^([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})$/);

  if (!match) {
    throw new Error(`Unsupported ACL important-date format '${dateText}'.`);
  }

  const [, monthName, rawDay, rawYear] = match;
  const monthIndex = MONTHS_LONG.indexOf(monthName);

  if (monthIndex === -1) {
    throw new Error(`Unsupported month '${monthName}' in '${dateText}'.`);
  }

  return new Date(Date.UTC(Number(rawYear), monthIndex, Number(rawDay) + 1, 11, 59, 59));
}

function resolveMonthIndex(monthName) {
  const longMonthIndex = MONTHS_LONG.indexOf(monthName);

  if (longMonthIndex !== -1) {
    return longMonthIndex;
  }

  return MONTHS.indexOf(monthName.slice(0, 3));
}

function parseMonthDayYearWithAoe(dateText) {
  const match = dateText.match(/^([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})$/);

  if (!match) {
    throw new Error(`Unsupported date format '${dateText}'.`);
  }

  const [, monthName, rawDay, rawYear] = match;
  const monthIndex = resolveMonthIndex(monthName);

  if (monthIndex === -1) {
    throw new Error(`Unsupported month '${monthName}' in '${dateText}'.`);
  }

  return new Date(Date.UTC(Number(rawYear), monthIndex, Number(rawDay) + 1, 11, 59, 59));
}

function parseDayMonthYearWithAoe(dateText) {
  const match = dateText.match(/^(\d{1,2})\s+([A-Z][a-z]{2,8})\s+(\d{4})$/);

  if (!match) {
    throw new Error(`Unsupported date format '${dateText}'.`);
  }

  const [, rawDay, monthName, rawYear] = match;
  const monthIndex = resolveMonthIndex(monthName);

  if (monthIndex === -1) {
    throw new Error(`Unsupported month '${monthName}' in '${dateText}'.`);
  }

  return new Date(Date.UTC(Number(rawYear), monthIndex, Number(rawDay) + 1, 11, 59, 59));
}

function parseDateRangeEndWithAoe(dateText) {
  const crossMonthMatch = dateText.match(
    /^([A-Z][a-z]+)\s+(\d{1,2})\s*-\s*([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})$/
  );

  if (crossMonthMatch) {
    const [, , , endMonthName, rawEndDay, rawYear] = crossMonthMatch;
    return parseDateOnlyWithAoe(`${endMonthName} ${rawEndDay}, ${rawYear}`);
  }

  const sameMonthMatch = dateText.match(/^([A-Z][a-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2}),\s+(\d{4})$/);

  if (sameMonthMatch) {
    const [, monthName, , rawEndDay, rawYear] = sameMonthMatch;
    return parseDateOnlyWithAoe(`${monthName} ${rawEndDay}, ${rawYear}`);
  }

  throw new Error(`Unsupported EMNLP important-date range format '${dateText}'.`);
}

function parseFlexibleDateRangeEndWithAoe(dateText) {
  const normalized = dateText.replace(/[–—]/g, "-").trim();
  const crossMonthMatch = normalized.match(
    /^([A-Z][a-z]+)\s+(\d{1,2})\s*-\s*([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})$/
  );

  if (crossMonthMatch) {
    const [, , , endMonthName, rawEndDay, rawYear] = crossMonthMatch;
    return parseMonthDayYearWithAoe(`${endMonthName} ${rawEndDay}, ${rawYear}`);
  }

  const sameMonthMatch = normalized.match(/^([A-Z][a-z]+)\s+(\d{1,2})\s*-\s*(\d{1,2}),\s+(\d{4})$/);

  if (sameMonthMatch) {
    const [, monthName, , rawEndDay, rawYear] = sameMonthMatch;
    return parseMonthDayYearWithAoe(`${monthName} ${rawEndDay}, ${rawYear}`);
  }

  return parseDateRangeEndWithAoe(normalized);
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

function parseAclImportantDatesRows(html) {
  const importantDatesSection = html.match(
    /<h2[^>]*id="important-dates"[^>]*>[\s\S]*?<\/h2>\s*<table>([\s\S]*?)<\/table>/i
  )?.[1];

  if (!importantDatesSection) {
    throw new Error("Could not find the ACL Important Dates table in the official homepage snapshot.");
  }

  return [...importantDatesSection.matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi)].map(
    (match) => ({
      label: stripHtml(match[1]),
      displayDate: stripHtml(match[2])
    })
  );
}

function matchAclCanonicalDeadline(row, includeKinds) {
  for (const deadline of ACL_IMPORTANT_DATES) {
    if (includeKinds && !includeKinds.includes(deadline.kind)) {
      continue;
    }

    if (deadline.patterns.some((pattern) => pattern.test(row.label))) {
      return {
        ...deadline,
        notes: `Pulled from the official ACL homepage Important Dates row '${row.label}'.`
      };
    }
  }

  return null;
}

function parseEmnlpImportantDatesRows(html) {
  const importantDatesSection = html.match(
    /<h2[^>]*id="important-dates"[^>]*>[\s\S]*?<\/h2>\s*<table>([\s\S]*?)<\/table>/i
  )?.[1];

  if (!importantDatesSection) {
    throw new Error("Could not find the EMNLP Important Dates table in the official homepage snapshot.");
  }

  return [...importantDatesSection.matchAll(/<tr>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gi)].map(
    (match) => ({
      label: stripHtml(match[1]),
      displayDate: stripHtml(match[2])
    })
  );
}

function matchEmnlpCanonicalDeadline(row, includeKinds) {
  for (const deadline of EMNLP_IMPORTANT_DATES) {
    if (includeKinds && !includeKinds.includes(deadline.kind)) {
      continue;
    }

    if (deadline.patterns.some((pattern) => pattern.test(row.label))) {
      return {
        ...deadline,
        notes:
          deadline.kind === "author_response"
            ? `Pulled from the official EMNLP homepage Important Dates row '${row.label}' and normalized to the discussion end date.`
            : `Pulled from the official EMNLP homepage Important Dates row '${row.label}'.`
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

function extractAclImportantDates(html, config) {
  const rows = parseAclImportantDatesRows(html);
  const seenKinds = new Set();
  const deadlines = [];

  for (const row of rows) {
    const matchedDeadline = matchAclCanonicalDeadline(row, config.includeKinds);

    if (!matchedDeadline || seenKinds.has(matchedDeadline.kind)) {
      continue;
    }

    deadlines.push({
      name: matchedDeadline.name,
      kind: matchedDeadline.kind,
      dueAt: parseDateOnlyWithAoe(row.displayDate).toISOString(),
      notes: matchedDeadline.notes,
      isHard: matchedDeadline.isHard,
      sourceLabel: row.label,
      section: "Important Dates"
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
    rows
  };
}

function extractEmnlpImportantDates(html, config) {
  const rows = parseEmnlpImportantDatesRows(html);
  const seenKinds = new Set();
  const deadlines = [];

  for (const row of rows) {
    const matchedDeadline = matchEmnlpCanonicalDeadline(row, config.includeKinds);

    if (!matchedDeadline || seenKinds.has(matchedDeadline.kind)) {
      continue;
    }

    deadlines.push({
      name: matchedDeadline.name,
      kind: matchedDeadline.kind,
      dueAt:
        matchedDeadline.kind === "author_response"
          ? parseDateRangeEndWithAoe(row.displayDate).toISOString()
          : parseDateOnlyWithAoe(row.displayDate).toISOString(),
      notes: matchedDeadline.notes,
      isHard: matchedDeadline.isHard,
      sourceLabel: row.label,
      section: "Important Dates"
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
    rows
  };
}

function normalizeImportantDatesText(html) {
  return stripHtml(html).replace(/[–—]/g, "-");
}

function extractMatchedDateValue(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractAistatsImportantDates(html, config) {
  const text = normalizeImportantDatesText(html);
  const definitions = [
    {
      kind: "abstract_submission",
      name: "Abstract submission deadline",
      isHard: true,
      label: "Abstract Submission Deadline",
      patterns: [/Abstract Submission Deadline\s+([A-Z][a-z]{2}\s+\d{2}\s+'?\d{2}\s+\(Anywhere on Earth\))/i],
      parseDate: (value) => parseDisplayTimestamp(value)
    },
    {
      kind: "paper_submission",
      name: "Paper submission deadline",
      isHard: true,
      label: "Paper Submission Deadline",
      patterns: [/Paper Submission Deadline\s+([A-Z][a-z]{2}\s+\d{2}\s+'?\d{2}\s+\(Anywhere on Earth\))/i],
      parseDate: (value) => parseDisplayTimestamp(value)
    },
    {
      kind: "decision_notification",
      name: "Decision notification",
      isHard: false,
      label: "Paper Decision Notifications",
      patterns: [/Paper Decision Notifications?\s+([A-Z][a-z]{2}\s+\d{2}\s+'?\d{2}\s+\(Anywhere on Earth\))/i],
      parseDate: (value) => parseDisplayTimestamp(value)
    }
  ];

  return extractStructuredImportantDates(text, config, definitions, "Official Dates");
}

function extractKddImportantDates(html, config) {
  const text = normalizeImportantDatesText(html);
  const definitions = [
    {
      kind: "abstract_submission",
      name: "Abstract submission deadline",
      isHard: true,
      label: "Abstract Deadline",
      patterns: [/Abstract Deadline\s*:?\s*([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i],
      parseDate: (value) => parseMonthDayYearWithAoe(value)
    },
    {
      kind: "paper_submission",
      name: "Paper submission deadline",
      isHard: true,
      label: "Paper Deadline",
      patterns: [/Paper Deadline\s*:?\s*([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i],
      parseDate: (value) => parseMonthDayYearWithAoe(value)
    },
    {
      kind: "author_response",
      name: "Author response deadline",
      isHard: true,
      label: "Author Rebuttal Period",
      patterns: [/Author Rebuttal Period\s*:?\s*([A-Z][a-z]{2,8}\s+\d{1,2}\s*-\s*\d{1,2},\s+\d{4})/i],
      parseDate: (value) => parseFlexibleDateRangeEndWithAoe(value)
    },
    {
      kind: "decision_notification",
      name: "Decision notification",
      isHard: false,
      label: "Notification",
      patterns: [/Notification\s*:?\s*([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i],
      parseDate: (value) => parseMonthDayYearWithAoe(value)
    }
  ];

  return extractStructuredImportantDates(text, config, definitions, "Important Dates");
}

function extractWebconfImportantDates(html, config) {
  const text = normalizeImportantDatesText(html);
  const definitions = [
    {
      kind: "abstract_submission",
      name: "Abstract submission deadline",
      isHard: true,
      label: "Abstract submission",
      patterns: [/Research\s*&\s*Industry tracks papers\s+Abstract submission\s+([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i],
      parseDate: (value) => parseMonthDayYearWithAoe(value)
    },
    {
      kind: "paper_submission",
      name: "Paper submission deadline",
      isHard: true,
      label: "Paper submission",
      patterns: [/Research\s*&\s*Industry tracks papers[\s\S]*?Paper submission\s+([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i],
      parseDate: (value) => parseMonthDayYearWithAoe(value)
    },
    {
      kind: "author_response",
      name: "Author response deadline",
      isHard: true,
      label: "Rebuttal period",
      patterns: [/Research\s*&\s*Industry tracks papers[\s\S]*?Rebuttal period\s+([A-Z][a-z]{2,8}\s+\d{1,2}\s*-\s*[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4}|[A-Z][a-z]{2,8}\s+\d{1,2}\s*-\s*\d{1,2},\s+\d{4})/i],
      parseDate: (value) => parseFlexibleDateRangeEndWithAoe(value)
    },
    {
      kind: "decision_notification",
      name: "Decision notification",
      isHard: false,
      label: "Paper notification",
      patterns: [/Research\s*&\s*Industry tracks papers[\s\S]*?Paper notification\s+([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i],
      parseDate: (value) => parseMonthDayYearWithAoe(value)
    }
  ];

  return extractStructuredImportantDates(text, config, definitions, "Research & Industry tracks papers");
}

function extractNaaclImportantDates(html, config) {
  const text = normalizeImportantDatesText(html);
  const definitions = [
    {
      kind: "paper_submission",
      name: "Paper submission deadline",
      isHard: true,
      label: "Submission deadline for ARR 2024 October",
      patterns: [/([\d]{1,2}\s+[A-Z][a-z]{2,8}\s+\d{4})\s*:\s*Submission deadline for ARR 2024 October/i],
      parseDate: (value) => parseDayMonthYearWithAoe(value)
    },
    {
      kind: "reviews_released",
      name: "Reviews released",
      isHard: false,
      label: "Reviews and meta-reviews released for ARR 2024 October",
      patterns: [/([\d]{1,2}\s+[A-Z][a-z]{2,8}\s+\d{4})\s*:\s*Reviews and meta-reviews released for ARR 2024 October/i],
      parseDate: (value) => parseDayMonthYearWithAoe(value)
    },
    {
      kind: "author_response",
      name: "Author response deadline",
      isHard: true,
      label: "Author response period for ARR 2024 October",
      patterns: [/([\d]{1,2}\s+[A-Z][a-z]{2,8}\s+\d{4}\s*-\s*[\d]{1,2}\s+[A-Z][a-z]{2,8}\s+\d{4})\s*:\s*Author response period for ARR 2024 October/i],
      parseDate: (value) => {
        const rangeMatch = value.match(
          /^(\d{1,2}\s+[A-Z][a-z]{2,8}\s+\d{4})\s*-\s*(\d{1,2}\s+[A-Z][a-z]{2,8}\s+\d{4})$/
        );

        if (!rangeMatch) {
          throw new Error(`Unsupported NAACL date range '${value}'.`);
        }

        return parseDayMonthYearWithAoe(rangeMatch[2]);
      }
    },
    {
      kind: "decision_notification",
      name: "Decision notification",
      isHard: false,
      label: "Notification of acceptance for NAACL 2025",
      patterns: [/([\d]{1,2}\s+[A-Z][a-z]{2,8}\s+\d{4})\s*:\s*Notification of acceptance for NAACL 2025/i],
      parseDate: (value) => parseDayMonthYearWithAoe(value)
    }
  ];

  return extractStructuredImportantDates(text, config, definitions, "Important Dates for NAACL 2025");
}

function extractColmImportantDates(html, config) {
  const text = normalizeImportantDatesText(html);
  const definitions = [
    {
      kind: "abstract_submission",
      name: "Abstract submission deadline",
      isHard: true,
      label: "Abstract deadline",
      patterns: [/Abstract deadline\s*:?\s*([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i],
      parseDate: (value) => parseMonthDayYearWithAoe(value)
    },
    {
      kind: "paper_submission",
      name: "Paper submission deadline",
      isHard: true,
      label: "Paper submission deadline",
      patterns: [/Paper submission deadline\s*:?\s*([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i],
      parseDate: (value) => parseMonthDayYearWithAoe(value)
    },
    {
      kind: "reviews_released",
      name: "Reviews released",
      isHard: false,
      label: "Reviews released",
      patterns: [/Reviews released\s*:?\s*([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i],
      parseDate: (value) => parseMonthDayYearWithAoe(value)
    },
    {
      kind: "author_response",
      name: "Author response deadline",
      isHard: true,
      label: "Rebuttal period",
      patterns: [/Rebuttal period\s*:?\s*([A-Z][a-z]{2,8}\s+\d{1,2}\s+to\s+[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i],
      parseDate: (value) => {
        const rangeMatch = value.match(
          /^([A-Z][a-z]{2,8})\s+(\d{1,2})\s+to\s+([A-Z][a-z]{2,8})\s+(\d{1,2}),\s+(\d{4})$/
        );

        if (!rangeMatch) {
          throw new Error(`Unsupported COLM rebuttal range '${value}'.`);
        }

        const [, , , endMonthName, rawEndDay, rawYear] = rangeMatch;
        return parseMonthDayYearWithAoe(`${endMonthName} ${rawEndDay}, ${rawYear}`);
      }
    },
    {
      kind: "decision_notification",
      name: "Decision notification",
      isHard: false,
      label: "Decision notifications",
      patterns: [/Decision notifications\s*:?\s*([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i],
      parseDate: (value) => parseMonthDayYearWithAoe(value)
    }
  ];

  return extractStructuredImportantDates(text, config, definitions, "Important Dates");
}

function extractStructuredImportantDates(text, config, definitions, section) {
  const seenKinds = new Set();
  const deadlines = [];

  for (const definition of definitions) {
    if (config.includeKinds && !config.includeKinds.includes(definition.kind)) {
      continue;
    }

    const dateValue = extractMatchedDateValue(text, definition.patterns);

    if (!dateValue || seenKinds.has(definition.kind)) {
      continue;
    }

    deadlines.push({
      name: definition.name,
      kind: definition.kind,
      dueAt: definition.parseDate(dateValue).toISOString(),
      notes: `Pulled from the official ${config.venueSlug.toUpperCase()} dates source row '${definition.label}'.`,
      isHard: definition.isHard,
      sourceLabel: definition.label,
      section
    });
    seenKinds.add(definition.kind);
  }

  const missingKinds = (config.includeKinds ?? []).filter((kind) => !seenKinds.has(kind));

  if (missingKinds.length > 0) {
    throw new Error(
      `Missing canonical milestones ${missingKinds.join(", ")} in ${config.venueSlug}/${config.sourceKey}.`
    );
  }

  return {
    deadlines,
    rows: definitions.map((definition) => ({
      label: definition.label,
      section
    }))
  };
}

function extractDeadlines(html, config) {
  switch (config.parser) {
    case "conference-dates-v1":
      return extractCanonicalDeadlines(html, config);
    case "acl-important-dates-v1":
      return extractAclImportantDates(html, config);
    case "emnlp-important-dates-v1":
      return extractEmnlpImportantDates(html, config);
    case "aistats-important-dates-v1":
      return extractAistatsImportantDates(html, config);
    case "kdd-important-dates-v1":
      return extractKddImportantDates(html, config);
    case "webconf-important-dates-v1":
      return extractWebconfImportantDates(html, config);
    case "naacl-important-dates-v1":
      return extractNaaclImportantDates(html, config);
    case "colm-important-dates-v1":
      return extractColmImportantDates(html, config);
    default:
      throw new Error(`Unsupported parser '${config.parser}' for ${config.venueSlug}/${config.editionYear}.`);
  }
}

module.exports = {
  extractDeadlines
};
