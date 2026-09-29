import unittest

from fastapi.testclient import TestClient

from app import app
from engine import MAX_QUESTION, Retriever, split_page


class RetrievalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.retriever = Retriever.from_disk()

    def test_split_keeps_short_page_and_bounds_long_chunks(self):
        self.assertEqual(split_page("short text"), ["short text"])
        chunks = split_page("test sentence " * 200)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(chunk) < 1100 for chunk in chunks))

    def test_citation_points_to_real_passage_and_pdf_page(self):
        answer = self.retriever.ask("What are the four functions of the AI RMF core?")
        self.assertEqual(answer["status"], "evidence_found")
        top = answer["sources"][0]
        self.assertEqual((top["source_id"], top["page"]), ("ai-rmf", 25))
        self.assertIn("GOVERN, MAP, MEASURE", top["text"])
        self.assertTrue(top["url"].endswith(".pdf"))

    def test_out_of_scope_question_abstains(self):
        answer = self.retriever.ask("What is the weather in Berlin today?")
        self.assertEqual(answer["status"], "no_evidence")
        self.assertEqual(answer["sources"], [])

    def test_question_length_is_bounded(self):
        with self.assertRaises(ValueError):
            self.retriever.ask("a" * (MAX_QUESTION + 1))

    def test_api_returns_citations_and_rejects_oversized_input(self):
        client = TestClient(app)
        self.assertEqual(client.get("/health").status_code, 200)
        response = client.post("/api/ask", json={"question": "What is prompt injection?"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["sources"][0]["source_id"], "genai-profile")
        self.assertEqual(client.post("/api/ask", json={"question": "x" * 501}).status_code, 422)


if __name__ == "__main__":
    unittest.main()
