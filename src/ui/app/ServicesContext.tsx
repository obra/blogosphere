// ABOUTME: React context that hands the Services DI aggregate down the tree.
// ABOUTME: useServices() throws when called outside a ServicesProvider.
import { createContext, type ReactNode, useContext } from "react";
import type { Services } from "../../core/services";

const ServicesContext = createContext<Services | null>(null);

interface ServicesProviderProps {
  services: Services;
  children: ReactNode;
}

function ServicesProvider(props: ServicesProviderProps) {
  return (
    <ServicesContext.Provider value={props.services}>{props.children}</ServicesContext.Provider>
  );
}

/** Read the DI aggregate. Throws outside a ServicesProvider so misuse fails loudly. */
function useServices(): Services {
  const services = useContext(ServicesContext);
  if (!services) {
    throw new Error("useServices was called outside a ServicesProvider");
  }
  return services;
}

// biome-ignore lint/style/useComponentExportOnlyModules: ServicesProvider + useServices() are one deliverable by design (see spec); Fast Refresh still works, it just also reloads this hook's callers.
export { ServicesProvider, type ServicesProviderProps, useServices };
