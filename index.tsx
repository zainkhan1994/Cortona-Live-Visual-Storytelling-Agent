/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session, Type, FunctionDeclaration} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';

const STORAGE_KEY = 'cortona_gemini_api_key';

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';
  @state() imageUrl = '';
  @state() visualizerMode = 0; // 0: HTML Image, 1: Abstract Orb, 2: Emoji, 3: 3D Sprite
  @state() emoji = '';
  @state() orbColor = '#000010';
  @state() orbSpeed = 1;
  @state() orbIntensity = 1;
  @state() apiKey = '';
  @state() apiKeyInput = '';
  @state() isInitialized = false;

  private toggleMode() {
    this.visualizerMode = (this.visualizerMode + 1) % 4;
    const modes = ['Clean HTML Image', 'Abstract Orb Morphing', 'Emoji Reactor', '3D Hologram Sprite'];
    this.updateStatus(`Mode switched to: ${modes[this.visualizerMode]}`);
  }

  private client: GoogleGenAI;
  private session: Session;
  private inputAudioContext = new (window.AudioContext ||
    window.webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    window.webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();

  static styles = css`
    /* ── API Key landing screen ── */
    .key-screen {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(ellipse at 50% 40%, #0a0a2e 0%, #000005 100%);
      z-index: 100;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }

    .key-card {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(100, 180, 255, 0.2);
      border-radius: 20px;
      padding: 48px 40px;
      max-width: 480px;
      width: 90vw;
      box-shadow: 0 0 60px rgba(80, 140, 255, 0.12), 0 8px 32px rgba(0,0,0,0.5);
      backdrop-filter: blur(12px);
      text-align: center;
    }

    .key-card .logo {
      font-size: 48px;
      margin-bottom: 8px;
    }

    .key-card h1 {
      margin: 0 0 6px;
      font-size: 1.7rem;
      font-weight: 700;
      color: #e0eeff;
      letter-spacing: 0.5px;
    }

    .key-card .subtitle {
      color: rgba(160, 200, 255, 0.7);
      font-size: 0.9rem;
      margin: 0 0 32px;
    }

    .key-card label {
      display: block;
      text-align: left;
      color: rgba(180, 210, 255, 0.9);
      font-size: 0.82rem;
      font-weight: 600;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .key-input-wrap {
      position: relative;
      margin-bottom: 14px;
    }

    .key-card input[type="password"],
    .key-card input[type="text"] {
      width: 100%;
      box-sizing: border-box;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(100, 180, 255, 0.3);
      border-radius: 10px;
      color: #e0eeff;
      font-size: 0.95rem;
      padding: 12px 44px 12px 14px;
      outline: none;
      transition: border-color 0.2s;
    }

    .key-card input:focus {
      border-color: rgba(100, 180, 255, 0.7);
    }

    .key-card input::placeholder {
      color: rgba(120, 160, 220, 0.4);
    }

    .toggle-visibility {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      cursor: pointer;
      color: rgba(140, 180, 255, 0.6);
      font-size: 18px;
      padding: 4px;
      line-height: 1;
    }

    .toggle-visibility:hover {
      color: rgba(180, 210, 255, 0.9);
    }

    .key-card .hint {
      text-align: left;
      font-size: 0.78rem;
      color: rgba(140, 180, 255, 0.5);
      margin-bottom: 24px;
    }

    .key-card .hint a {
      color: rgba(100, 180, 255, 0.8);
      text-decoration: none;
    }

    .key-card .hint a:hover {
      text-decoration: underline;
    }

    .key-card .submit-btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #1a4fd8, #0d2fa8);
      border: none;
      border-radius: 10px;
      color: white;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
      letter-spacing: 0.3px;
    }

    .key-card .submit-btn:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .key-card .submit-btn:active {
      transform: translateY(0);
    }

    .key-card .error-msg {
      color: #ff6b6b;
      font-size: 0.82rem;
      margin-top: 10px;
      min-height: 18px;
    }

    .key-card .features {
      margin-top: 28px;
      display: flex;
      justify-content: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .key-card .feature-pill {
      background: rgba(80, 140, 255, 0.08);
      border: 1px solid rgba(80, 140, 255, 0.2);
      border-radius: 20px;
      padding: 5px 12px;
      font-size: 0.75rem;
      color: rgba(160, 200, 255, 0.7);
    }

    /* ── Change key button ── */
    .change-key-btn {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 20;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px;
      color: rgba(200, 220, 255, 0.7);
      font-size: 0.75rem;
      padding: 6px 12px;
      cursor: pointer;
      transition: background 0.2s;
      font-family: 'Segoe UI', system-ui, sans-serif;
    }

    .change-key-btn:hover {
      background: rgba(255,255,255,0.14);
      color: rgba(200, 220, 255, 1);
    }

    /* ── Main app controls ── */
    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 10vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 10px;

      button {
        outline: none;
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.1);
        width: 64px;
        height: 64px;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        margin: 0;

        &:hover {
          background: rgba(255, 255, 255, 0.2);
        }
      }

      button[disabled] {
        display: none;
      }
    }
  `;

  constructor() {
    super();
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      this.apiKey = saved;
      this.isInitialized = true;
      // initClient is called after first render via updated()
    }
  }

  private _isClientInitialized = false;

  override updated(changedProps: Map<string, unknown>) {
    if (changedProps.has('isInitialized') && this.isInitialized && !this._isClientInitialized) {
      this._isClientInitialized = true;
      this.initClient();
    }
  }

  private handleApiKeyInput(e: Event) {
    this.apiKeyInput = (e.target as HTMLInputElement).value;
  }

  private handleKeySubmit(e: Event) {
    e.preventDefault();
    const key = this.apiKeyInput.trim();
    if (!key) {
      this.error = 'Please enter a valid API key.';
      return;
    }
    this.error = '';
    this.apiKey = key;
    localStorage.setItem(STORAGE_KEY, key);
    this.isInitialized = true;
  }

  private handleChangeKey() {
    this.stopRecording();
    this.session?.close();
    this._isClientInitialized = false;
    this.isInitialized = false;
    this.apiKey = '';
    this.apiKeyInput = '';
    this.imageUrl = '';
    this.error = '';
    this.status = '';
    localStorage.removeItem(STORAGE_KEY);
  }

  private _showApiKey = false;

  private toggleKeyVisibility() {
    this._showApiKey = !this._showApiKey;
    this.requestUpdate();
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async generateObjectImage(objectName: string) {
    this.updateStatus(`Generating image for: ${objectName}...`);
    try {
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: `A single ${objectName}, neon wireframe hologram style, glowing, isolated on a pure black background, 3d render, high quality.`,
      });
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          const base64EncodeString = part.inlineData.data;
          this.imageUrl = `data:image/jpeg;base64,${base64EncodeString}`;
          this.updateStatus(`Visualizer updated to: ${objectName}`);
          break;
        }
      }
    } catch (e) {
      console.error('Failed to generate image', e);
      this.updateStatus(`Failed to generate image for ${objectName}`);
    }
  }

  private async initClient() {
    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: this.apiKey,
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private async initSession() {
    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';

    try {
      this.session = await this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Opened');
          },
          onmessage: async (message: LiveServerMessage) => {
            const audio =
              message.serverContent?.modelTurn?.parts[0]?.inlineData;

            if (audio) {
              this.nextStartTime = Math.max(
                this.nextStartTime,
                this.outputAudioContext.currentTime,
              );

              const audioBuffer = await decodeAudioData(
                decode(audio.data),
                this.outputAudioContext,
                24000,
                1,
              );
              const source = this.outputAudioContext.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(this.outputNode);
              source.addEventListener('ended', () => {
                this.sources.delete(source);
              });

              source.start(this.nextStartTime);
              this.nextStartTime = this.nextStartTime + audioBuffer.duration;
              this.sources.add(source);
            }

            const interrupted = message.serverContent?.interrupted;
            if (interrupted) {
              for (const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
            }

            if (message.toolCall) {
              const functionCalls = message.toolCall.functionCalls;
              if (functionCalls) {
                const functionResponses = [];
                for (const call of functionCalls) {
                  if (call.name === 'updateVisualizerObject') {
                    const { objectName, emoji, colorHex, speed, intensity } = call.args;
                    this.emoji = (emoji as string) || '';
                    this.orbColor = (colorHex as string) || '#000010';
                    this.orbSpeed = (speed as number) || 1;
                    this.orbIntensity = (intensity as number) || 1;
                    
                    await this.generateObjectImage(objectName as string);
                    functionResponses.push({
                      id: call.id,
                      name: call.name,
                      response: { result: 'Visualizer parameters updated for ' + objectName }
                    });
                  }
                }
                if (functionResponses.length > 0) {
                  this.session.sendToolResponse({ functionResponses });
                }
              }
            }
          },
          onerror: (e: ErrorEvent) => {
            this.updateError(e.message);
          },
          onclose: (e: CloseEvent) => {
            this.updateStatus('Close:' + e.reason);
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Orus'}},
            // languageCode: 'en-GB'
          },
          systemInstruction: 'You are an interactive audio orb. You can talk to the user. If the user mentions an object, or if you think of an object that represents the conversation, you can use the updateVisualizerObject tool to display it in the visualizer. Always use the tool when a new object is mentioned. Provide an appropriate emoji, a representative hex color, a speed multiplier (0.5 to 3.0), and an intensity multiplier (0.5 to 3.0).',
          tools: [{
            functionDeclarations: [{
              name: 'updateVisualizerObject',
              description: 'Update the visualizer to show an object mentioned by the user, along with its abstract properties.',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  objectName: {
                    type: Type.STRING,
                    description: 'The name of the object to display.',
                  },
                  emoji: {
                    type: Type.STRING,
                    description: 'A single emoji representing the object.',
                  },
                  colorHex: {
                    type: Type.STRING,
                    description: 'A hex color code representing the object (e.g., #ff4400 for fire).',
                  },
                  speed: {
                    type: Type.NUMBER,
                    description: 'Animation speed multiplier (0.5 to 3.0).',
                  },
                  intensity: {
                    type: Type.NUMBER,
                    description: 'Audio reactivity intensity (0.5 to 3.0).',
                  },
                },
                required: ['objectName', 'emoji', 'colorHex', 'speed', 'intensity'],
              },
            }],
          }],
        },
      });
    } catch (e) {
      console.error(e);
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
  }

  private updateError(msg: string) {
    this.error = msg;
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    this.inputAudioContext.resume();

    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Microphone access granted. Starting capture...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 256;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        this.session.sendRealtimeInput({media: createBlob(pcmData)});
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.updateStatus('🔴 Recording... Capturing PCM chunks.');
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateStatus(`Error: ${err.message}`);
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext)
      return;

    this.updateStatus('Stopping recording...');

    this.isRecording = false;

    if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }

    this.scriptProcessorNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.updateStatus('Recording stopped. Click Start to begin again.');
  }

  private reset() {
    this.session?.close();
    this.initSession();
    this.imageUrl = '';
    this.updateStatus('Session cleared.');
  }

  render() {
    if (!this.isInitialized) {
      return html`
        <div class="key-screen">
          <div class="key-card">
            <div class="logo">🔮</div>
            <h1>Cortona</h1>
            <p class="subtitle">Live Visual Storytelling Agent</p>

            <form @submit=${this.handleKeySubmit}>
              <label for="api-key-input">Gemini API Key</label>
              <div class="key-input-wrap">
                <input
                  id="api-key-input"
                  type=${this._showApiKey ? 'text' : 'password'}
                  placeholder="AIza..."
                  .value=${this.apiKeyInput}
                  @input=${this.handleApiKeyInput}
                  autocomplete="off"
                  spellcheck="false"
                />
                <button
                  type="button"
                  class="toggle-visibility"
                  @click=${this.toggleKeyVisibility}
                  title=${this._showApiKey ? 'Hide key' : 'Show key'}>
                  ${this._showApiKey ? '🙈' : '👁️'}
                </button>
              </div>
              <p class="hint">
                Your key is stored only in your browser's localStorage and never sent to any server other than Google's API.
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener">Get a free API key →</a>
              </p>
              <button type="submit" class="submit-btn">Launch Experience</button>
              ${this.error ? html`<p class="error-msg">${this.error}</p>` : ''}
            </form>

            <div class="features">
              <span class="feature-pill">🎙️ Live Voice</span>
              <span class="feature-pill">🖼️ Image Generation</span>
              <span class="feature-pill">🌐 3D Visualizer</span>
            </div>
          </div>
        </div>
      `;
    }

    return html`
      <div>
        <button class="change-key-btn" @click=${this.handleChangeKey} title="Change API key">
          🔑 Change Key
        </button>
        <div class="controls">
          <button
            id="resetButton"
            @click=${this.reset}
            ?disabled=${this.isRecording}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="40px"
              viewBox="0 -960 960 960"
              width="40px"
              fill="#ffffff">
              <path
                d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
            </svg>
          </button>
          <button
            id="startButton"
            @click=${this.startRecording}
            ?disabled=${this.isRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#c80000"
              xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="50" />
            </svg>
          </button>
          <button
            id="stopButton"
            @click=${this.stopRecording}
            ?disabled=${!this.isRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#000000"
              xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="100" height="100" rx="15" />
            </svg>
          </button>
          <button
            id="modeButton"
            @click=${this.toggleMode}
            title="Toggle Visualizer Mode">
            <svg xmlns="http://www.w3.org/2000/svg" height="32px" viewBox="0 -960 960 960" width="32px" fill="#ffffff">
              <path d="M480-120 200-272v-240L40-600l440-240 440 240-160 88v240L480-120Zm0-262 280-153-280-153-280 153 280 153Zm-200 85v116l200 109 200-109v-116l-200 109-200-109Zm200-85Zm0 85Z"/>
            </svg>
          </button>
        </div>

        <div id="status"> ${this.error || this.status} </div>
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}
          .imageUrl=${this.imageUrl}
          .mode=${this.visualizerMode}
          .emoji=${this.emoji}
          .orbColor=${this.orbColor}
          .orbSpeed=${this.orbSpeed}
          .orbIntensity=${this.orbIntensity}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}
