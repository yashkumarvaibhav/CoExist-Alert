/** Demo/simulator control failure with an HTTP-mappable status and code. */
export class SimulatorError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SimulatorError";
  }
}
