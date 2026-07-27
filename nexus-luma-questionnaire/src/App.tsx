import { QuestionnaireApp } from "./components/questionnaire/QuestionnaireApp";
import type { QuestionnaireResult } from "./types/questionnaire";

// This file is a runnable demo host. When integrating into the real
// Nexus Luma project, import QuestionnaireApp from ./index instead.
function App() {
  const handleComplete = (result: QuestionnaireResult) => {
    // eslint-disable-next-line no-console
    console.log("Questionnaire completed:", result);
  };

  const handleAnalyticsEvent = (eventName: string, eventData?: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console.log("[analytics]", eventName, eventData);
  };

  return (
    <QuestionnaireApp
      onComplete={handleComplete}
      onAnalyticsEvent={handleAnalyticsEvent}
      devMode={false}
    />
  );
}

export default App;
