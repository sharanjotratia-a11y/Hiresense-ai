(() => {
    const form = document.getElementById("interview-form");
    const setup = document.getElementById("voice-setup");
    const startButton = document.getElementById("start-interview");
    const languageSelect = document.getElementById("voice-language");
    const languageInput = document.getElementById("answer-language");
    const sessionStatus = document.getElementById("session-status");
    const cards = Array.from(document.querySelectorAll("[data-question-index]"));
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!form || !setup || !startButton || !languageSelect || !languageInput || !sessionStatus || cards.length === 0) {
        return;
    }

    let currentIndex = 0;
    let activeRecognition = null;
    let activeVoiceButton = null;
    let cameraStream = null;
    let cameraRequestInProgress = false;

    function setCameraState(card, message, enabled) {
        const status = card.querySelector("[data-camera-status]");
        const video = card.querySelector(".camera-video");
        const placeholder = card.querySelector(".camera-placeholder");
        const button = card.querySelector("[data-camera-toggle]");

        status.textContent = message;
        card.classList.toggle("camera-enabled", enabled);
        placeholder.hidden = enabled;
        button.textContent = enabled ? "Turn camera off" : "Turn camera on";
        if (!enabled) {
            video.srcObject = null;
        }
    }

    async function enableCamera(card) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setCameraState(card, "Camera access requires a supported browser on HTTPS or localhost.", false);
            return false;
        }

        if (cameraStream && cameraStream.getVideoTracks().some((track) => track.readyState === "live")) {
            const video = card.querySelector(".camera-video");
            video.srcObject = cameraStream;
            setCameraState(card, "Camera is on. Your preview stays on this device.", true);
            return true;
        }

        if (cameraRequestInProgress) {
            return false;
        }

        cameraRequestInProgress = true;
        const button = card.querySelector("[data-camera-toggle]");
        button.disabled = true;
        card.querySelector("[data-camera-status]").textContent = "Waiting for camera permission...";

        try {
            cameraStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { facingMode: "user" }
            });
            cards.forEach((questionCard) => {
                const video = questionCard.querySelector(".camera-video");
                video.srcObject = cameraStream;
                video.play().catch(() => {
                    questionCard.querySelector("[data-camera-status]").textContent =
                        "Camera is ready. Select the camera preview if the video does not start.";
                });
                setCameraState(questionCard, "Camera is on. Your preview stays on this device.", true);
            });

            cameraStream.getVideoTracks().forEach((track) => {
                track.addEventListener("ended", () => {
                    cameraStream = null;
                    cards.forEach((questionCard) => {
                        setCameraState(questionCard, "Camera stopped. Turn it on again to show your preview.", false);
                    });
                }, { once: true });
            });
            return true;
        } catch (error) {
            cameraStream = null;
            const reason = error.name === "NotAllowedError"
                ? "Camera permission was denied. You can continue without video or allow camera access in browser settings."
                : error.name === "NotFoundError"
                    ? "No camera was found. Connect a camera or continue without video."
                    : `Could not start the camera (${error.message}). You can continue without video.`;
            cards.forEach((questionCard) => setCameraState(questionCard, reason, false));
            sessionStatus.textContent = reason;
            return false;
        } finally {
            cameraRequestInProgress = false;
            button.disabled = false;
        }
    }

    function disableCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach((track) => track.stop());
            cameraStream = null;
        }
        cards.forEach((card) => {
            setCameraState(card, "Camera is off. Turn it on again to show your preview.", false);
        });
    }

    function currentLanguage() {
        return languageSelect.value;
    }

    function questionText(card) {
        if (currentLanguage() === "hi-IN") {
            return card.dataset.hindiQuestion || card.querySelector(".question").textContent.trim();
        }
        return card.dataset.englishQuestion || card.querySelector(".question").textContent.trim();
    }

    function updateQuestionLanguage() {
        cards.forEach((card) => {
            card.querySelector(".question").textContent = questionText(card);
        });
        languageInput.value = currentLanguage();
    }

    function setAssistantState(card, state, message) {
        card.querySelector("[data-assistant-state]").dataset.assistantState = state;
        card.querySelector("[data-assistant-prompt]").textContent = message;
    }

    function speakCurrentQuestion() {
        const card = cards[currentIndex];
        const answerStatus = card.querySelector("[data-voice-status]");

        if (activeRecognition) {
            answerStatus.textContent = "Finish your answer before asking the assistant to repeat the question.";
            return;
        }

        if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
            sessionStatus.textContent = "Spoken questions are not supported in this browser. Read the question on screen and answer by voice or text.";
            if (answerStatus) {
                answerStatus.textContent = "Read the question above, then speak your answer or type it below.";
            }
            setAssistantState(card, "ready", "Read the question on screen, then answer by voice or text.");
            return;
        }

        window.speechSynthesis.cancel();
        const greeting = currentLanguage() === "hi-IN"
            ? (currentIndex === 0 ? "नमस्ते! मैं आपका इंटरव्यू असिस्टेंट हूँ। पहला सवाल: " : "अगला सवाल: ")
            : (currentIndex === 0 ? "Hello! I'm your interview assistant. Here's your first question: " : "Here's your next question: ");
        const utterance = new SpeechSynthesisUtterance(`${greeting}${questionText(card)}`);
        utterance.lang = currentLanguage();
        const matchingVoice = window.speechSynthesis.getVoices().find(
            (voice) => voice.lang.toLowerCase() === currentLanguage().toLowerCase()
        );
        if (matchingVoice) {
            utterance.voice = matchingVoice;
        }
        utterance.onstart = () => {
            setAssistantState(card, "speaking", "Asking you a question...");
            if (answerStatus) {
                answerStatus.textContent = "The assistant is speaking. Your microphone will start after the question.";
            }
        };
        utterance.onend = () => {
            const textarea = card.querySelector("textarea");
            const voiceButton = card.querySelector("[data-voice-input]");
            if (textarea.value.trim()) {
                setAssistantState(card, "ready", "Your turn. Add to your answer or continue when ready.");
                if (answerStatus) {
                    answerStatus.textContent = "Your turn. Press Start answer or type your response.";
                }
            } else if (SpeechRecognition) {
                setAssistantState(card, "listening", "I'm listening. Speak naturally, then tap Stop answering.");
                startAnswer(voiceButton, textarea, answerStatus);
            } else {
                setAssistantState(card, "ready", "Voice answering is unavailable here. Type your answer instead.");
                if (answerStatus) {
                    answerStatus.textContent = "Voice recognition is not supported in this browser. Type your answer instead.";
                }
            }
        };
        utterance.onerror = () => {
            setAssistantState(card, "ready", "The question is on screen. Answer by voice or text.");
            if (answerStatus) {
                answerStatus.textContent = "Read the question above, then answer by voice or text.";
            }
        };
        window.speechSynthesis.speak(utterance);
    }

    function finishRecognition(button, status, recognition, errorMessage) {
        if (activeRecognition === recognition) {
            activeRecognition = null;
            activeVoiceButton = null;
        }
        button.setAttribute("aria-pressed", "false");
        button.innerHTML = '<span aria-hidden="true">🎙</span> Start answer';
        if (errorMessage) {
            status.dataset.state = "error";
            status.textContent = errorMessage;
            setAssistantState(status.closest(".question-card"), "ready", errorMessage);
        } else {
            delete status.dataset.state;
            status.textContent = "Answer captured. You can edit it, then continue.";
            setAssistantState(status.closest(".question-card"), "ready", "Answer captured. Continue when you're ready.");
        }
    }

    function startAnswer(button, textarea, status) {
        if (!SpeechRecognition) {
            status.dataset.state = "error";
            status.textContent = "Voice recognition is not supported in this browser. Type your answer instead.";
            button.disabled = true;
            return;
        }

        if (activeRecognition) {
            if (activeVoiceButton === button) {
                status.textContent = "Finishing your answer...";
                activeRecognition.stop();
            } else {
                status.textContent = "Finish the current answer before starting another.";
            }
            return;
        }

        if ("speechSynthesis" in window) {
            window.speechSynthesis.cancel();
        }

        const recognition = new SpeechRecognition();
        const startingText = textarea.value.trim();
        let finalTranscript = "";
        let recognitionError = "";

        recognition.lang = currentLanguage();
        recognition.continuous = true;
        recognition.interimResults = true;
        activeRecognition = recognition;
        activeVoiceButton = button;

        recognition.onstart = () => {
            button.setAttribute("aria-pressed", "true");
            button.innerHTML = '<span aria-hidden="true">■</span> Stop answering';
            status.dataset.state = "listening";
            status.textContent = "Listening... speak naturally, then press Stop answering.";
            setAssistantState(status.closest(".question-card"), "listening", "I'm listening. Speak naturally, then tap Stop answering.");
        };

        recognition.onresult = (event) => {
            let interimTranscript = "";
            for (let index = event.resultIndex; index < event.results.length; index += 1) {
                const transcript = event.results[index][0].transcript.trim();
                if (event.results[index].isFinal) {
                    finalTranscript += `${transcript} `;
                } else {
                    interimTranscript += `${transcript} `;
                }
            }
            textarea.value = [startingText, finalTranscript.trim(), interimTranscript.trim()]
                .filter(Boolean)
                .join(" ");
        };

        recognition.onerror = (event) => {
            const messages = {
                "not-allowed": "Microphone access was blocked. Allow microphone access in your browser settings, then try again.",
                "no-speech": "No speech was detected. Check your microphone and try again.",
                "network": "Speech recognition needs an internet connection. Check your connection and try again.",
                "audio-capture": "No microphone was found. Connect a microphone or type your answer.",
                "language-not-supported": "Speech recognition is unavailable for this language. You can type your answer instead."
            };
            recognitionError = messages[event.error] || `Speech recognition stopped (${event.error}). Type your answer or try again.`;
        };

        recognition.onend = () => {
            finishRecognition(
                button,
                status,
                recognition,
                recognitionError || (finalTranscript.trim() ? "" : "No answer was captured. Try speaking again or type your answer.")
            );
        };

        try {
            recognition.start();
        } catch (error) {
            finishRecognition(button, status, recognition, `Could not start speech recognition: ${error.message}`);
        }
    }

    function showQuestion(index, shouldSpeak) {
        currentIndex = index;
        cards.forEach((card, cardIndex) => {
            card.hidden = cardIndex !== currentIndex;
        });

        const card = cards[currentIndex];
        const textarea = card.querySelector("textarea");
        const nextButton = card.querySelector("[data-next-question]");
        const submitButton = card.querySelector("[data-submit-interview]");
        if (cameraStream) {
            card.querySelector(".camera-video").srcObject = cameraStream;
        }
        textarea.required = true;
        textarea.focus({ preventScroll: true });
        if (nextButton) {
            nextButton.hidden = currentIndex === cards.length - 1;
        }
        if (submitButton) {
            submitButton.hidden = currentIndex !== cards.length - 1;
        }
        if (shouldSpeak) {
            speakCurrentQuestion();
        }
        card.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    cards.forEach((card) => {
        const textarea = card.querySelector("textarea");
        const voiceButton = card.querySelector("[data-voice-input]");
        const status = card.querySelector("[data-voice-status]");
        const nextButton = card.querySelector("[data-next-question]");
        const repeatButton = card.querySelector("[data-repeat-question]");
        const cameraButton = card.querySelector("[data-camera-toggle]");
        textarea.required = false;

        if (!SpeechRecognition) {
            voiceButton.disabled = true;
            status.textContent = "Voice answering is not supported in this browser. Type your answer instead.";
        }

        voiceButton.addEventListener("click", () => startAnswer(voiceButton, textarea, status));
        repeatButton.addEventListener("click", () => speakCurrentQuestion());
        cameraButton.addEventListener("click", async () => {
            if (cameraStream) {
                disableCamera();
            } else {
                await enableCamera(card);
            }
        });

        if (nextButton) {
            nextButton.addEventListener("click", () => {
                if (activeRecognition) {
                    status.textContent = "Stop your spoken answer before moving to the next question.";
                    return;
                }
                if (!textarea.value.trim()) {
                    status.dataset.state = "error";
                    status.textContent = "Add or dictate an answer before moving to the next question.";
                    textarea.focus();
                    return;
                }
                showQuestion(currentIndex + 1, true);
            });
        }
    });

    form.addEventListener("submit", (event) => {
        const missingIndex = cards.findIndex((card) => !card.querySelector("textarea").value.trim());
        if (missingIndex !== -1) {
            event.preventDefault();
            setup.hidden = true;
            showQuestion(missingIndex, false);
            const status = cards[missingIndex].querySelector("[data-voice-status]");
            status.dataset.state = "error";
            status.textContent = "Please answer this question before getting your feedback.";
        }
    });

    startButton.addEventListener("click", () => {
        startButton.disabled = true;
        startButton.textContent = "Starting your interview...";
        setup.hidden = true;
        languageSelect.disabled = true;
        languageInput.value = currentLanguage();
        showQuestion(0, true);
        startButton.disabled = false;
    });

    languageSelect.addEventListener("change", () => {
        updateQuestionLanguage();
        sessionStatus.textContent = `Interview language set to ${languageSelect.options[languageSelect.selectedIndex].text}.`;
    });

    updateQuestionLanguage();
    cards.forEach((card) => {
        card.hidden = true;
    });

    window.addEventListener("pagehide", disableCamera, { once: true });
})();
