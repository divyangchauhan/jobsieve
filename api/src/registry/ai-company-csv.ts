export interface CsvValidationOptions {
  readonly label: string;
  readonly requiredHeaders: readonly string[];
  readonly keyHeader: string;
  readonly minimumRows: number;
}

function parseRows(raw: string, label: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    if (quoted) {
      if (char === '"' && raw[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
        closedQuote = true;
      } else {
        field += char;
      }
    } else if (closedQuote) {
      if (char === ',') {
        row.push(field);
        field = '';
        closedQuote = false;
      } else if (char === '\n') {
        row.push(field.replace(/\r$/, ''));
        rows.push(row);
        row = [];
        field = '';
        closedQuote = false;
      } else if (char !== '\r') {
        throw new Error(`${label}: unexpected character after a quoted field`);
      }
    } else if (char === '"') {
      if (field.length > 0) {
        throw new Error(`${label}: unexpected quote in an unquoted field`);
      }
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (quoted) throw new Error(`${label}: unbalanced quoted field`);
  if (field.length > 0 || row.length > 0 || closedQuote) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

export function parseValidatedCsv<T extends object>(
  raw: string,
  options: CsvValidationOptions,
): T[] {
  const rows = parseRows(raw, options.label);
  const header = rows.shift();
  if (header === undefined || header.length === 0) {
    throw new Error(`${options.label}: missing header row`);
  }
  if (header.some((name) => name.length === 0)) {
    throw new Error(`${options.label}: header names must not be empty`);
  }
  if (new Set(header).size !== header.length) {
    throw new Error(`${options.label}: duplicate header name`);
  }
  for (const required of options.requiredHeaders) {
    if (!header.includes(required)) {
      throw new Error(`${options.label}: missing required header ${required}`);
    }
  }

  const populatedRows = rows.filter((values) =>
    values.some((value) => value.length > 0),
  );
  populatedRows.forEach((values, index) => {
    if (values.length !== header.length) {
      throw new Error(
        `${options.label}: row ${index + 2} has ${values.length} columns; expected ${header.length}`,
      );
    }
  });
  if (populatedRows.length < options.minimumRows) {
    throw new Error(
      `${options.label}: found ${populatedRows.length} rows; expected at least ${options.minimumRows}`,
    );
  }

  const parsed = populatedRows.map((values) =>
    Object.fromEntries(header.map((name, index) => [name, values[index]])),
  ) as unknown as T[];
  const keys = new Set<string>();
  for (const [index, typedRecord] of parsed.entries()) {
    const record = typedRecord as Record<string, string>;
    const key = record[options.keyHeader]?.trim();
    if (!key) {
      throw new Error(
        `${options.label}: row ${index + 2} has an empty ${options.keyHeader}`,
      );
    }
    if (keys.has(key)) {
      throw new Error(
        `${options.label}: duplicate ${options.keyHeader} value ${key}`,
      );
    }
    keys.add(key);
  }
  return parsed;
}
