import type { Server } from "http";

export function listenOnAvailablePort(
  server: Server,
  preferredPort: number,
  host: string,
  onPortConflict: (port: number) => void = () => {},
  allowFallback = true,
) {
  return new Promise<number>((resolve, reject) => {
    const listen = (port: number, allowFallback: boolean) => {
      const handleError = (error: NodeJS.ErrnoException) => {
        server.off("listening", handleListening);

        if (error.code === "EADDRINUSE" && allowFallback) {
          onPortConflict(port);
          listen(0, false);
          return;
        }

        reject(error);
      };

      const handleListening = () => {
        server.off("error", handleError);
        const address = server.address();

        if (!address || typeof address === "string") {
          reject(new Error("Server did not expose a TCP port"));
          return;
        }

        resolve(address.port);
      };

      server.once("error", handleError);
      server.once("listening", handleListening);

      try {
        server.listen(port, host);
      } catch (error) {
        server.off("error", handleError);
        server.off("listening", handleListening);
        reject(error);
      }
    };

    listen(preferredPort, allowFallback);
  });
}
