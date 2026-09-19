// Never log HTTP error objects: they can contain API tokens or webhook URLs.
export class Logger {
  failures = 0;
  constructor(private readonly name: string) {}
  log(message: string) {
    console.info(this.name, message);
  }
  debug(_message: string) {}
  warn(_message: string) {
    this.failures++;
    console.warn(`${this.name}: source request failed or unavailable`);
  }
  error(_message: string) {
    this.failures++;
    console.error(`${this.name}: source request failed`);
  }
}
