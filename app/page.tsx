"use client";

import { FormEvent, useState } from "react";
import type { Feedback, Question } from "@/lib/bedrock";
import type { RepositorySnapshot, SourceFile } from "@/lib/github";

type QuestionsResponse = { questions: Question[] };
type FeedbackResponse = { feedback: Feedback };

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function CodeViewer({
  file,
  from,
  to,
  href,
}: {
  file: SourceFile;
  from: number;
  to: number;
  href: string;
}) {
  const lines = file.content.split("\n");
  const first = Math.max(1, from - 12);
  const last = Math.min(lines.length, to + 16);

  return (
    <section className="code-panel" aria-label="Referenced source code">
      <div className="code-panel__header">
        <span>{file.path}</span>
        <a href={href} target="_blank" rel="noreferrer">
          Open on GitHub ↗
        </a>
      </div>

      <pre className="code-panel__body">
        <code>
          {lines.slice(first - 1, last).map((line, index) => {
            const lineNumber = first + index;
            const selected = lineNumber >= from && lineNumber <= to;

            return (
              <span
                key={lineNumber}
                className={selected ? "code-line code-line--selected" : "code-line"}
              >
                <span className="line-number">{lineNumber}</span>
                <span className="line-copy">{line || " "}</span>
              </span>
            );
          })}
        </code>
      </pre>

      <div className="code-panel__footer">
        Highlighted lines are the interviewer&apos;s reference.
      </div>
    </section>
  );
}

export default function HomePage() {
  const [repositoryUrl, setRepositoryUrl] = useState("");
  const [repository, setRepository] = useState<RepositorySnapshot | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [status, setStatus] = useState<"loading" | "reviewing" | null>(null);
  const [error, setError] = useState("");

  const question = questions[questionIndex];
  const source = repository?.files.find((file) => file.path === question?.path);
  const activePrompt = followUp || question?.prompt;

  const sourceUrl =
    repository && question
      ? `https://github.com/${repository.name}/blob/${repository.sha}/${question.path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}#L${question.from}-L${question.to}`
      : "";

  async function startSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("loading");
    setRepository(null);
    setQuestions([]);
    setFeedback(null);
    setFollowUp(null);
    setQuestionIndex(0);

    try {
      const repo = await postJson<RepositorySnapshot>("/api/repository", {
        url: repositoryUrl,
      });

      const generated = await postJson<QuestionsResponse>("/api/practice", {
        mode: "questions",
        files: repo.files,
      });

      setRepository(repo);
      setQuestions(generated.questions);
      setAnswer("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start interview.");
    } finally {
      setStatus(null);
    }
  }

  async function reviewAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!source || !question || !activePrompt || answer.trim().length < 10) {
      return;
    }

    setError("");
    setStatus("reviewing");

    try {
      const result = await postJson<FeedbackResponse>("/api/practice", {
        mode: "evaluate",
        file: source,
        question: activePrompt,
        answer,
        from: question.from,
        to: question.to,
      });

      setFeedback(result.feedback);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to review answer.");
    } finally {
      setStatus(null);
    }
  }

  function resetSession() {
    setRepository(null);
    setQuestions([]);
    setQuestionIndex(0);
    setFollowUp(null);
    setAnswer("");
    setFeedback(null);
    setError("");
  }

  function moveNext() {
    if (questionIndex + 1 >= questions.length) {
      resetSession();
      setRepositoryUrl("");
      return;
    }

    setQuestionIndex((current) => current + 1);
    setFollowUp(null);
    setAnswer("");
    setFeedback(null);
    setError("");
  }

  function answerFollowUp() {
    if (!feedback) {
      return;
    }

    setFollowUp(feedback.followUp);
    setFeedback(null);
    setAnswer("");
    setError("");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand__mark">{"{ }"}</span>
          <span>Explain Your Build</span>
        </a>
        <span className="topbar__caption">Code-grounded interview practice</span>
      </header>

      <div className="content">
        {!repository || !question ? (
          <section className="landing">
            <p className="eyebrow">A DIFFERENT KIND OF INTERVIEW PREP</p>
            <h1>
              You built it.
              <br />
              <span>Can you explain it?</span>
            </h1>
            <p className="lede">
              Practice the questions an engineer might ask about your actual project:
              decisions, failure cases, tradeoffs, and the code behind your résumé bullet.
            </p>

            <form className="connect-card" onSubmit={startSession}>
              <label htmlFor="repository">Public GitHub repository</label>
              <div className="connect-row">
                <input
                  id="repository"
                  type="url"
                  value={repositoryUrl}
                  onChange={(event) => setRepositoryUrl(event.target.value)}
                  placeholder="https://github.com/owner/project"
                  required
                  disabled={status !== null}
                />
                <button type="submit" disabled={status !== null}>
                  {status === "loading" ? "Reading code…" : "Start interview →"}
                </button>
              </div>
              <p className="microcopy">
                Public repositories only for the MVP. Code is read, never executed.
              </p>
              {error ? <p className="error">{error}</p> : null}
            </form>

            <div className="steps">
              <article>
                <span>01</span>
                <h2>Connect real code</h2>
                <p>We select meaningful source files and pin the exact commit.</p>
              </article>
              <article>
                <span>02</span>
                <h2>Explain your choices</h2>
                <p>Questions point to the exact code your interviewer wants to discuss.</p>
              </article>
              <article>
                <span>03</span>
                <h2>Go one level deeper</h2>
                <p>Get grounded coaching, then answer a realistic follow-up.</p>
              </article>
            </div>
          </section>
        ) : (
          <section className="practice">
            <div className="practice__header">
              <div>
                <p className="eyebrow">MOCK TECHNICAL INTERVIEW</p>
                <h1>Explain your thinking.</h1>
                <p className="repo-meta">
                  {repository.name} · {repository.sha.slice(0, 7)} ·{" "}
                  {repository.files.length} files reviewed
                </p>
              </div>
              <button className="secondary" type="button" onClick={resetSession}>
                Change repository
              </button>
            </div>

            <div className="progress-row">
              <span>
                Question {questionIndex + 1} of {questions.length}
                {followUp ? " · follow-up" : ""}
              </span>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${((questionIndex + 1) / questions.length) * 100}%`,
                  }}
                />
              </div>
            </div>

            <div className="practice-grid">
              <div className="interview-column">
                <article className="question-card">
                  <p className="topic">✦ {question.topic}</p>
                  <h2>{activePrompt}</h2>
                  <p>
                    Use the highlighted code as evidence. Explain your reasoning like
                    you would to another engineer.
                  </p>
                </article>

                {feedback ? (
                  <section className="feedback-card" aria-live="polite">
                    <p className="eyebrow">INTERVIEWER FEEDBACK</p>
                    <p className="feedback-copy">{feedback.feedback}</p>

                    {feedback.good.length ? (
                      <div>
                        <h3>What you explained well</h3>
                        <ul>
                          {feedback.good.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {feedback.improve.length ? (
                      <div>
                        <h3>What to strengthen</h3>
                        <ul>
                          {feedback.improve.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="button-row">
                      <button type="button" onClick={answerFollowUp}>
                        Answer follow-up ↗
                      </button>
                      <button className="secondary" type="button" onClick={moveNext}>
                        {questionIndex + 1 === questions.length
                          ? "Finish session"
                          : "Next question →"}
                      </button>
                    </div>
                  </section>
                ) : (
                  <form className="answer-card" onSubmit={reviewAnswer}>
                    <label htmlFor="answer">Your explanation</label>
                    <textarea
                      id="answer"
                      rows={8}
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      placeholder="Walk through what the code does, why you chose this approach, and what could go wrong…"
                      disabled={status !== null}
                    />
                    <div className="answer-card__footer">
                      <span>Practice, not a grade. Be specific and think out loud.</span>
                      <button
                        type="submit"
                        disabled={status !== null || answer.trim().length < 10}
                      >
                        {status === "reviewing" ? "Reviewing…" : "Get feedback →"}
                      </button>
                    </div>
                  </form>
                )}

                {error ? <p className="error">{error}</p> : null}
              </div>

              <aside className="source-column">
                <div className="source-label">
                  <span>CODE REFERENCE</span>
                  <span>
                    Lines {question.from}–{question.to}
                  </span>
                </div>
                {source ? (
                  <CodeViewer
                    file={source}
                    from={question.from}
                    to={question.to}
                    href={sourceUrl}
                  />
                ) : (
                  <p className="error">Referenced source is unavailable.</p>
                )}
                <p className="privacy-note">
                  Read-only analysis. Repository code is never installed or executed.
                </p>
              </aside>
            </div>
          </section>
        )}
      </div>

      <footer className="footer">
        <span>Built for students who want to own their work.</span>
        <span>Powered by Amazon Bedrock.</span>
      </footer>
    </main>
  );
}
