/**
 * Incrementally extracts one top-level string field (e.g. "story") from a JSON object that is
 * still being streamed, so readers see the story appear word by word even though the model is
 * producing structured JSON. Feed raw text chunks to `push`; it returns newly decoded characters.
 */
export class JsonStringFieldStreamer {
  private buf = "";
  private pos = 0;
  private state: "seeking" | "inString" | "done" = "seeking";
  private depth = 0;

  constructor(private readonly field: string) {}

  push(chunk: string): string {
    this.buf += chunk;
    let out = "";
    while (this.pos < this.buf.length && this.state !== "done") {
      if (this.state === "seeking") {
        if (!this.seek()) break;
      } else {
        const r = this.readString();
        out += r.text;
        if (!r.progressed) break;
      }
    }
    return out;
  }

  get finished() {
    return this.state === "done";
  }

  /** Scans for `"field":"` at depth 1, skipping over other strings. Returns false if more input is needed. */
  private seek(): boolean {
    while (this.pos < this.buf.length) {
      const c = this.buf[this.pos];
      if (c === "{" || c === "[") {
        this.depth++;
        this.pos++;
      } else if (c === "}" || c === "]") {
        this.depth--;
        this.pos++;
      } else if (c === '"') {
        const end = this.findStringEnd(this.pos + 1);
        if (end < 0) return false; // key/value string not complete yet
        const key = this.buf.slice(this.pos + 1, end);
        const after = this.buf.slice(end + 1).match(/^\s*:\s*/);
        if (this.depth === 1 && key === this.field) {
          if (!after) return false;
          const valueStart = end + 1 + after[0].length;
          if (valueStart >= this.buf.length) return false;
          if (this.buf[valueStart] === '"') {
            this.pos = valueStart + 1;
            this.state = "inString";
            return true;
          }
        }
        this.pos = end + 1;
      } else {
        this.pos++;
      }
    }
    return false;
  }

  private findStringEnd(from: number): number {
    for (let i = from; i < this.buf.length; i++) {
      if (this.buf[i] === "\\") i++;
      else if (this.buf[i] === '"') return i;
    }
    return -1;
  }

  /** Decodes as much of the target string as is available. */
  private readString(): { text: string; progressed: boolean } {
    let text = "";
    const start = this.pos;
    while (this.pos < this.buf.length) {
      const c = this.buf[this.pos];
      if (c === '"') {
        this.pos++;
        this.state = "done";
        break;
      }
      if (c === "\\") {
        const next = this.buf[this.pos + 1];
        if (next === undefined) break; // wait for the rest of the escape
        if (next === "u") {
          const hex = this.buf.slice(this.pos + 2, this.pos + 6);
          if (hex.length < 4) break;
          text += String.fromCharCode(parseInt(hex, 16));
          this.pos += 6;
          continue;
        }
        const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" };
        text += map[next] ?? next;
        this.pos += 2;
        continue;
      }
      text += c;
      this.pos++;
    }
    return { text, progressed: this.pos > start };
  }
}
