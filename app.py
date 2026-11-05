from flask import Flask, render_template, request
import speech_recognition as sr

app = Flask(__name__, static_folder="uploads/static", static_url_path="/static")

# ---------------------------------------------------
# Interview Questions and Expected Keywords
# ---------------------------------------------------

questions = [
    {
        "question": "Tell me about yourself.",
        "hindi_question": "अपने बारे में बताइए।",
        "keywords": [
            "education", "skills", "project",
            "experience", "python", "machine learning"
        ],
        "hindi_keywords": [
            ["शिक्षा"], ["कौशल"], ["परियोजना", "प्रोजेक्ट"],
            ["अनुभव"], ["पाइथन", "पायथन"], ["मशीन लर्निंग"]
        ]
    },
    {
        "question": "What is machine learning?",
        "hindi_question": "मशीन लर्निंग क्या है?",
        "keywords": [
            "machine", "learning", "data",
            "model", "prediction", "algorithm"
        ],
        "hindi_keywords": [
            ["मशीन"], ["लर्निंग", "सीखना"], ["डेटा"],
            ["मॉडल"], ["भविष्यवाणी"], ["एल्गोरिदम"]
        ]
    },
    {
        "question": "What is Python?",
        "hindi_question": "पाइथन क्या है?",
        "keywords": [
            "python", "programming", "language",
            "object", "data", "application"
        ],
        "hindi_keywords": [
            ["पाइथन", "पायथन"], ["प्रोग्रामिंग"], ["भाषा"],
            ["ऑब्जेक्ट", "वस्तु"], ["डेटा"], ["एप्लिकेशन", "अनुप्रयोग"]
        ]
    },
    {
        "question": "What is artificial intelligence?",
        "hindi_question": "आर्टिफिशियल इंटेलिजेंस यानी कृत्रिम बुद्धिमत्ता क्या है?",
        "keywords": [
            "artificial", "intelligence", "machine",
            "learning", "human", "decision"
        ],
        "hindi_keywords": [
            ["कृत्रिम"], ["बुद्धिमत्ता"], ["मशीन"],
            ["लर्निंग", "सीखना"], ["इंसान", "मानव"], ["निर्णय"]
        ]
    },
    {
        "question": "What is SQL?",
        "hindi_question": "SQL क्या है?",
        "keywords": [
            "sql", "database", "query",
            "table", "data", "record"
        ],
        "hindi_keywords": [
            ["एसक्यूएल"], ["डेटाबेस"], ["क्वेरी"],
            ["टेबल", "तालिका"], ["डेटा"], ["रिकॉर्ड"]
        ]
    }
]

# ---------------------------------------------------
# Simple Sentiment Words
# ---------------------------------------------------

positive_words = [
    "good", "great", "excellent", "strong",
    "confident", "success", "successful",
    "love", "best", "improve", "positive",
    "अच्छा", "बेहतरीन", "उत्कृष्ट", "मजबूत",
    "आत्मविश्वास", "सफल", "सुधार", "सकारात्मक"
]

negative_words = [
    "bad", "weak", "poor", "fail",
    "failure", "hate", "difficult",
    "problem", "negative", "don't know",
    "बुरा", "कमजोर", "खराब", "विफल", "असफलता",
    "कठिन", "समस्या", "नकारात्मक", "नहीं जानता", "नहीं जानती"
]


# ---------------------------------------------------
# Answer Quality
# ---------------------------------------------------

def calculate_relevance(answer, keywords, hindi_keywords=None):

    answer = answer.lower()

    matched = 0

    for index, word in enumerate(keywords):
        hindi_variants = hindi_keywords[index] if hindi_keywords else []
        if word.lower() in answer or any(
            variant in answer for variant in hindi_variants
        ):
            matched += 1

    score = (matched / len(keywords)) * 100

    return round(score, 2)


# ---------------------------------------------------
# Sentiment Analysis
# ---------------------------------------------------

def sentiment_analysis(answer):

    text = answer.lower()

    positive = 0
    negative = 0

    for word in positive_words:
        if word in text:
            positive += 1

    for word in negative_words:
        if word in text:
            negative += 1

    if positive > negative:
        sentiment = "Positive"
    elif negative > positive:
        sentiment = "Negative"
    else:
        sentiment = "Neutral"

    total = positive + negative

    if total == 0:
        sentiment_score = 50
    else:
        sentiment_score = (positive / total) * 100

    return sentiment, round(sentiment_score, 2)


# ---------------------------------------------------
# Confidence Analysis
# ---------------------------------------------------

def confidence_analysis(answer):

    words = answer.split()

    word_count = len(words)

    filler_words = [
        "um", "uh", "like",
        "maybe", "actually",
        "उम", "अह", "मतलब", "शायद"
    ]

    filler_count = 0

    for word in words:
        if word.lower() in filler_words:
            filler_count += 1
    filler_count += answer.lower().count("you know")

    if word_count == 0:
        return 0

    score = 100 - ((filler_count / word_count) * 100)

    # Very short answers indicate lower confidence
    if word_count < 5:
        score -= 25
    elif word_count < 10:
        score -= 10

    score = max(0, min(100, score))

    return round(score, 2)


# ---------------------------------------------------
# Overall Score
# ---------------------------------------------------

def calculate_overall(relevance, sentiment, confidence):

    score = (
        relevance * 0.50 +
        sentiment * 0.20 +
        confidence * 0.30
    )

    return round(score, 2)


# ---------------------------------------------------
# Feedback
# ---------------------------------------------------

def generate_feedback(score, language="en-IN"):

    feedback = []

    if language == "hi-IN":
        if score >= 80:
            feedback.append(
                "बहुत बढ़िया! आपका जवाब प्रासंगिक और आत्मविश्वास से भरा है।"
            )
        elif score >= 60:
            feedback.append(
                "अच्छा जवाब। इसे और बेहतर बनाने के लिए थोड़ी और गहराई और स्पष्टता जोड़ें।"
            )
        elif score >= 40:
            feedback.append(
                "अपने जवाब में विषय से जुड़ी थोड़ी और जानकारी जोड़ने की कोशिश करें।"
            )
        else:
            feedback.append(
                "अगली बार अपना जवाब थोड़ा और स्पष्ट और विस्तार से देने की कोशिश करें।"
            )
        return feedback

    if score >= 80:
        feedback.append(
            "Excellent answer. Your response is relevant and confident."
        )

    elif score >= 60:
        feedback.append(
            "Good answer, but you can improve the depth and clarity."
        )

    elif score >= 40:
        feedback.append(
            "Your answer needs more relevant technical information."
        )

    else:
        feedback.append(
            "Try to provide a clearer and more detailed answer."
        )

    return feedback


# ---------------------------------------------------
# Home Page
# ---------------------------------------------------

@app.route("/")
def home():

    return render_template(
        "index.html",
        total_questions=len(questions)
    )


# ---------------------------------------------------
# Start Interview
# ---------------------------------------------------

@app.route("/interview")
def interview():

    return render_template(
        "interview.html",
        questions=questions
    )


# ---------------------------------------------------
# Analyze Interview
# ---------------------------------------------------

@app.route("/analyze", methods=["POST"])
def analyze():

    results = []

    total_score = 0

    answers = []

    for i, question_data in enumerate(questions):

        answer = request.form.get(
            f"answer_{i}",
            ""
        ).strip()

        answers.append(answer)

        relevance = calculate_relevance(
            answer,
            question_data["keywords"],
            question_data["hindi_keywords"]
        )

        sentiment, sentiment_score = sentiment_analysis(
            answer
        )

        confidence = confidence_analysis(
            answer
        )

        overall = calculate_overall(
            relevance,
            sentiment_score,
            confidence
        )

        total_score += overall

        results.append({
            "question": question_data["question"],
            "hindi_question": question_data["hindi_question"],
            "answer": answer,
            "relevance": relevance,
            "sentiment": sentiment,
            "sentiment_score": sentiment_score,
            "confidence": confidence,
            "overall": overall
        })

    if len(results) > 0:
        final_score = total_score / len(results)
    else:
        final_score = 0

    final_score = round(final_score, 2)

    answer_language = request.form.get("answer_language", "en-IN")
    feedback = generate_feedback(final_score, answer_language)

    return render_template(
        "result.html",
        results=results,
        final_score=final_score,
        feedback=feedback,
        answer_language=answer_language
    )


# ---------------------------------------------------
# Speech To Text API
# ---------------------------------------------------

@app.route("/speech", methods=["POST"])
def speech():

    recognizer = sr.Recognizer()

    try:

        audio_file = request.files["audio"]

        with sr.AudioFile(audio_file) as source:

            audio = recognizer.record(source)

        text = recognizer.recognize_google(audio)

        return {
            "success": True,
            "text": text
        }

    except Exception as e:

        return {
            "success": False,
            "text": "",
            "error": str(e)
        }


# ---------------------------------------------------
# Run Application
# ---------------------------------------------------

if __name__ == "__main__":

    app.run(
        debug=True,
        host="127.0.0.1",
        port=5000
    )