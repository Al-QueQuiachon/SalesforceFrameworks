import { LightningElement, api, wire, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getRecordNotifyChange } from 'lightning/uiRecordApi';
import getLLMConfigurations from '@salesforce/apex/LLMController.getLLMConfigurations';
import handleRequest from '@salesforce/apex/LLMController.handleRequest';
import checkRecordForAnomalies from '@salesforce/apex/LLMController.checkRecordForAnomalies';
import saveAnalysisToField from '@salesforce/apex/LLMController.saveAnalysisToField';
import processImagesWithAI from '@salesforce/apex/LLMController.processImagesWithAI';
import { getRecord } from 'lightning/uiRecordApi';
import ID_FIELD from '@salesforce/schema/Account.Id';
import { CurrentPageReference } from 'lightning/navigation';
import getPdfAttachmentsForRecord from '@salesforce/apex/LLMController.getPdfAttachmentsForRecord';
import processPdfDocumentWithAI from '@salesforce/apex/LLMController.processPdfDocumentWithAI';
import getObjectMetadataFromId from '@salesforce/apex/LLMController.getObjectMetadataFromId';
import extractFieldsFromDocuments from '@salesforce/apex/LLMController.extractFieldsFromDocuments';
import updateRecordFields from '@salesforce/apex/LLMController.updateRecordFields';
import { loadScript } from 'lightning/platformResourceLoader';
import chartjs from '@salesforce/resourceUrl/chartjs';

// Constants
const MAX_HISTORY_MESSAGES = 50; // Maximum number of messages to keep in history

export default class LLMAssistant extends LightningElement {
    @api recordId;
    @wire(CurrentPageReference) pageRef;
    
    // Design attributes for configuration from targetConfig
    @api primaryColor = '#22BDC1';  // Default Nuvitek teal
    @api accentColor = '#D5DF23';   // Default Nuvitek lime
    @api defaultModelName;          // If provided, this model will be preselected
    @api hideModelSelector = false; // Whether to hide the model selector
    @api cardTitle = 'AI Assistant'; // Configurable title
    @api contextPrompt = '';       // Custom context to provide to the LLM about its purpose/placement
    @api enableAnomalyDetection = false; // Whether to enable anomaly detection
    @api enableImageValidation = false; // Kept for backward compatibility/external dependencies
    @api enableComparison = false; // Whether to enable comparison feature
    @api comparisonRules = '';     // JSON string containing rules/standards to compare against (TO)
    @api compareFrom = '';         // Content to compare (source) - if provided, auto-comparison runs
    @api relatedObjects = '';      // Comma-separated list of object API names to search across for related data
    @api analysisFieldApiName = ''; // API name of field to save analysis summary
    @api questionInputLabel = 'Your Question'; // Label for the question input textarea
    @api questionInputPlaceholder = 'Type your question here...'; // Placeholder text for the question input textarea
    @api askButtonLabel = 'Ask Question'; // Label for the primary ask/submit button
    @api reportObjects = ''; // Comma-separated list of object API names to query for reporting (e.g., "Account,Case,Contact")
    @api enableGenerateReport = false; // Whether to show the Generate Report button
    
    // New design attribute for enabling document analysis
    @api enableDocumentAnalysis = false;
    // New design attribute for comma-delimited field API names for document data extraction
    @api documentAnalysisFieldsApiNames = '';
    
    // Flow-specific attributes
    @api conversationOutput;  // Output attribute to return conversation data to the Flow
    
    @track llmOptions = [];
    @track selectedLLM;
    @track selectedLLMLabel;
    @track userPrompt = '';
    @track response;
    @track isLoading = false;
    @track hasError = false;
    @track errorMessage = '';
    @track pageComponents = [];
    @track pageComponentsScanned = false;
    @track conversationHistory = []; // Track conversation history
    @track showConversationHistory = false; // Default to hiding history
    @track conversationSummary = ''; // Track conversation summary
    @track messagesTotalCount = 0; // Total message count including those pruned due to limits
    
    // New properties for analysis field functionality
    @track objectApiName;
    @track fieldLabel;
    @track showSaveAnalysisModal = false;
    @track currentAnalysis = '';
    @track analysisSummary = '';
    @track analysisSummaryCharCount = 0;
    
    // --- New properties for PDF Analysis ---
    @track pdfDocuments = [];
    @track isProcessingPdf = false;
    @track pdfProcessingError = null;
    _firstPdfIdToAnalyze = null; // Internal state for the ID of the first PDF
    // --- End PDF Analysis properties ---
    
    // --- New properties for Document Field Extraction Modal ---
    @track showExtractFieldsModal = false;
    @track extractedFieldsData = []; // Will hold { apiName, label, type, currentValue, suggestedValues, selectedValue } for each field
    @track isExtractingFields = false;
    // --- End Document Field Extraction Modal properties ---
    
    // --- New properties for Document Selection ---
    @track showDocumentSelectionModal = false;
    @track selectedDocumentIds = []; // Array of selected document IDs
    // --- End Document Selection properties ---
    
    // --- New properties for Anomaly Check ---
    @track anomalyCheckResult = ''; // Store the full result text from the AI
    @track anomalyCheckLoading = false; // Track if the initial anomaly check is running
    @track showAnomalyBanner = false; // Flag to control banner visibility
    @track anomalyBannerMessage = ''; // Message to display in the banner
    // --- End Anomaly Check properties ---
    
    // --- New properties for Comparison Feature ---
    @track comparisonCheckResult = ''; // Store the comparison result
    @track comparisonCheckLoading = false; // Track if comparison is running
    @track showComparisonBanner = false; // Flag to control comparison banner visibility
    @track comparisonBannerMessage = ''; // Message to display in the comparison banner
    @track comparisonInput = ''; // Input to compare against rules
    @track showComparisonModal = false; // Show comparison input modal
    @track comparisonDetailedResult = ''; // Store formatted detailed comparison result
    // --- End Comparison Feature properties ---
    
    // --- Accordion Control ---
    @track activeAccordionSections = []; // Keep track of open sections
    // --- End Accordion Control ---
    
    // --- New properties for Chart Visualization ---
    @track showReportModal = false; // Show report/chart modal
    @track reportData = null; // Store report data for charts
    @track reportChartType = 'bar'; // Current chart type: bar, pie, line, table
    @track isGeneratingReport = false; // Track if report is being generated
    @track reportError = ''; // Store report generation errors
    chartInstance = null; // Store Chart.js instance
    // --- End Chart Visualization properties ---
    
    // Cache for memoized functions
    colorCache = new Map();
    styleCache = null;
    lastPrimaryColor = null;
    lastAccentColor = null;
    
    // Performance optimization: Cache expensive operations
    _cachedRecordContext = null;
    _cachedRecordContextId = null;
    _cachedPageComponents = null;
    _cacheCleanupInterval = null;

    // Flag to detect when running in Flow context
    get isInFlowContext() {
        return !!this.template.querySelector('c-llm-assistant[data-flow-context]');
    }
    
    // Getter for detecting changes to conversation for Flow output
    get conversationData() {
        return {
            history: this.conversationHistory,
            summary: this.conversationSummary,
            messageCount: this.messagesTotalCount,
            lastResponse: this.response
        };
    }

    // Computed properties for text colors based on background brightness
    get primaryTextColor() {
        return this.getContrastColor(this.primaryColor);
    }
    
    get accentTextColor() {
        return this.getContrastColor(this.accentColor);
    }
    
    get userChatBubbleColor() {
        return this.adjustColor(this.primaryColor, 40); // Lighter version of primary
    }
    
    get userChatTextColor() {
        return this.getContrastColor(this.userChatBubbleColor);
    }
    
    get aiChatBubbleColor() {
        return "#f3f4f6"; // Light gray for AI bubbles
    }
    
    get aiChatTextColor() {
        return "#1d1d1f"; // Dark text for light backgrounds
    }

    // Check if "Analyze Record" button should be shown
    get showAnalyzeButton() {
        return !!this.recordId;
    }
    
    // Check if "Analyze Images" button should be shown
    get showImageAnalysisButton() {
        return !!this.recordId && this.enableImageValidation;
    }
    
    // Check if related objects are configured
    get hasRelatedObjects() {
        return !!this.relatedObjects && this.relatedObjects.trim() !== '';
    }
    
    // Check if "Compare" button should be shown
    // Always show when comparison is enabled with rules (users can compare different content manually)
    get showComparisonButton() {
        return this.enableComparison && 
               !!this.comparisonRules && this.comparisonRules.trim() !== '';
    }
    
    // Check if auto-comparison should be enabled (when compareFrom is provided)
    get shouldRunAutoComparison() {
        return this.enableComparison && 
               (this.compareFrom || this.effectiveRecordId) && 
               this.comparisonRules && this.comparisonRules.trim() !== '';
    }
    
    // Get comparison banner style based on result
    get comparisonBannerStyle() {
        if (this.comparisonBannerMessage && this.comparisonBannerMessage.includes('MEETS')) {
            return 'background-color: #d4edda; border-color: #c3e6cb;';
        } else {
            return 'background-color: #f8d7da; border-color: #f5c6cb;';
        }
    }
    
    // Get comparison icon name based on result
    get comparisonIconName() {
        return this.comparisonBannerMessage && this.comparisonBannerMessage.includes('MEETS') ? 'utility:success' : 'utility:warning';
    }
    
    // Get comparison icon alternative text based on result
    get comparisonIconAltText() {
        return this.comparisonBannerMessage && this.comparisonBannerMessage.includes('MEETS') ? 'Success' : 'Warning';
    }
    
    // Get comparison icon variant based on result
    get comparisonIconVariant() {
        return this.comparisonBannerMessage && this.comparisonBannerMessage.includes('MEETS') ? 'success' : 'warning';
    }
    
    // Get comparison accordion label based on result
    get comparisonAccordionLabel() {
        if (this.comparisonBannerMessage && this.comparisonBannerMessage.includes('MEETS')) {
            return 'Standards Compliance: MEETS Requirements ✓';
        } else {
            return 'Standards Compliance: DOES NOT MEET Requirements ⚠';
        }
    }
    
    // Get comparison accordion CSS class based on result
    get comparisonAccordionClass() {
        if (this.comparisonBannerMessage && this.comparisonBannerMessage.includes('MEETS')) {
            return 'slds-theme_success';
        } else {
            return 'slds-theme_warning';
        }
    }
    
    
    // Check if comparison button should be disabled
    get isComparisonButtonDisabled() {
        return !this.comparisonInput || this.comparisonInput.trim() === '';
    }

    // Dynamically set CSS variables based on configured colors
    get componentStyle() {
        // Use cached style if colors haven't changed
        if (this.styleCache && this.lastPrimaryColor === this.primaryColor && 
            this.lastAccentColor === this.accentColor) {
            return this.styleCache;
        }
        
        // Extract RGB values for rgba() usage
        const primaryRGB = this.hexToRgb(this.primaryColor);
        const accentRGB = this.hexToRgb(this.accentColor);
        
        // Get contrast text colors
        const primaryTextColor = this.primaryTextColor;
        const accentTextColor = this.accentTextColor;
        const userChatTextColor = this.userChatTextColor;

        // Create the style string
        this.styleCache = `--primary-color: ${this.primaryColor}; 
                --primary-dark: ${this.adjustColor(this.primaryColor, -20)}; 
                --primary-light: ${this.adjustColor(this.primaryColor, 20)};
                --primary-color-rgb: ${primaryRGB};
                --primary-text-color: ${primaryTextColor};
                --accent-color: ${this.accentColor};
                --accent-dark: ${this.adjustColor(this.accentColor, -20)};
                --accent-light: ${this.adjustColor(this.accentColor, 20)};
                --accent-color-rgb: ${accentRGB};
                --accent-text-color: ${accentTextColor};
                --chat-bubble-user: ${this.userChatBubbleColor};
                --chat-bubble-ai: ${this.aiChatBubbleColor};
                --chat-text-user: ${userChatTextColor};
                --chat-text-ai: ${this.aiChatTextColor};
                --model-badge-color: ${this.primaryColor};
                --model-badge-text-color: ${primaryTextColor};`;
        
        // Update cache tracking variables
        this.lastPrimaryColor = this.primaryColor;
        this.lastAccentColor = this.accentColor;
        
        return this.styleCache;
    }
    
    // Get contrast color (black or white) based on background brightness
    getContrastColor(hexColor) {
        // Default to black if no color provided
        if (!hexColor || !hexColor.startsWith('#')) return '#000000';
        
        // Check cache first
        const cacheKey = `contrast_${hexColor}`;
        if (this.colorCache.has(cacheKey)) {
            return this.colorCache.get(cacheKey);
        }
        
        // Parse hex color efficiently
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        
        // Calculate luminance using the perceived brightness formula
        // (Weighted average for human perception: R:0.299, G:0.587, B:0.114)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        // Use white text for dark backgrounds, black text for light backgrounds
        const result = luminance > 0.5 ? '#000000' : '#FFFFFF';
        
        // Cache the result
        this.colorCache.set(cacheKey, result);
        return result;
    }
    
    // Control visibility of model selector
    get showModelSelector() {
        return !this.hideModelSelector && this.llmOptions.length > 0;
    }
    
    // Getters for toggle button
    get toggleIconName() {
        return this.showConversationHistory ? 'utility:chevronup' : 'utility:chevrondown';
    }
    
    get toggleAlternativeText() {
        return this.showConversationHistory ? 'Hide conversation' : 'Show conversation';
    }
    
    get toggleTitle() {
        return this.showConversationHistory ? 'Hide conversation' : 'Show conversation';
    }

    // Getter for history limit message
    get historyLimitMessage() {
        if (this.messagesTotalCount > MAX_HISTORY_MESSAGES) {
            const hiddenMessages = this.messagesTotalCount - MAX_HISTORY_MESSAGES;
            return `Showing ${MAX_HISTORY_MESSAGES} of ${this.messagesTotalCount} messages (${hiddenMessages} older messages not shown)`;
        }
        return `Showing all ${this.messagesTotalCount} messages`;
    }
    
    // Helper for message class
    getMessageClass(isUser) {
        return isUser ? 'chat-message user-message' : 'chat-message ai-message';
    }
    
    // Helper for formatting message content
    getFormattedMessageContent(content) {
        return content.replace(/\n/g, '<br />');
    }
    
    // Format the conversation summary for display
    get formattedSummary() {
        return this.conversationSummary.replace(/\n/g, '<br />');
    }
    
    // Get formatted timestamp for messages
    getFormattedTimestamp() {
        const now = new Date();
        return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Format conversation for sending to LLM
    getConversationSummary() {
        if (this.conversationHistory.length === 0) return '';
        
        // If we have a generated summary and more than 10 messages, use it
        if (this.conversationSummary && this.conversationHistory.length > 10) {
            // Get just the recent messages (last 5)
            const recentMessages = this.conversationHistory.slice(-5);
            const recentMessagesSummary = recentMessages.map(msg => {
                const role = msg.isUser ? 'You' : 'AI';
                return `${role}: ${msg.content}`;
            }).join('\n\n');
            
            return `CONVERSATION SUMMARY:\n${this.conversationSummary}\n\nRECENT MESSAGES:\n${recentMessagesSummary}`;
        }
        
        // Otherwise format all messages
        const summary = this.conversationHistory.map(msg => {
            const role = msg.isUser ? 'You' : 'AI';
            return `${role}: ${msg.content}`;
        }).join('\n\n');
        
        return `PREVIOUS CONVERSATION:\n${summary}\n\n`;
    }

    // Clear conversation history
    clearConversation() {
        this.conversationHistory = [];
        this.conversationSummary = '';
        this.messagesTotalCount = 0;
        this.response = '';
        
        // Show feedback
        const clearButton = this.template.querySelector('.clear-button');
        if (clearButton) {
            this.provideFeedback(clearButton, 'Conversation cleared');
        }
    }
    
    // Toggle conversation history visibility
    toggleConversationHistory() {
        this.showConversationHistory = !this.showConversationHistory;
        
        // Set button data attributes for animation
        setTimeout(() => {
            const toggleButton = this.template.querySelector('.toggle-chat-button');
            const container = this.template.querySelector('.conversation-container');
            
            if (toggleButton) {
                toggleButton.setAttribute('data-expanded', this.showConversationHistory ? 'true' : 'false');
            }
            
            if (container) {
                container.setAttribute('data-expanded', this.showConversationHistory ? 'true' : 'false');
            }
        }, 0);
    }

    // Request a summary of the current conversation
    summarizeConversation() {
        // Only summarize if we have enough messages
        if (this.conversationHistory.length < 3) {
            console.log('Not enough messages to summarize');
            this.conversationSummary = 'The conversation has just started.';
            return;
        }
        
        // Don't summarize if already in progress
        if (this.isSummarizing) {
            console.log('Summarization already in progress');
            return;
        }
        
        this.isSummarizing = true;
        
        // Create an optimized conversation summary prompt
        const conversationText = this.conversationHistory.map(msg => {
            const role = msg.isUser ? 'User' : 'AI Assistant';
            return `${role}: ${msg.content}`;
        }).join('\n\n');
        
        const systemContext = this.buildSystemPrompt('general');
        const summaryPrompt = `${systemContext}Create a concise summary of this AI assistant conversation.

CONVERSATION TO SUMMARIZE:
${conversationText}

SUMMARY REQUIREMENTS:
• Focus on key topics discussed and main outcomes
• Highlight any important decisions, recommendations, or action items
• Note the primary purpose/goal of the conversation
• Keep it under 300 words
• Use professional, objective language
• Structure with brief paragraphs for readability
• REMEMBER: Apply your PRIMARY DIRECTIVE in how you approach this summary

${this.conversationSummary ? '\nEXISTING SUMMARY (to build upon):\n' + this.conversationSummary : ''}

Provide only the summary text without additional commentary.`;

        // Prepare the summary request with optimized prompt
        const requestParams = {
            configName: this.selectedLLM,
            prompt: summaryPrompt,
            operation: 'ask',
            recordId: '',
            relatedObjects: ''
        };
        
        // Add conversation history
        if (this.conversationHistory && this.conversationHistory.length > 0) {
            // Only send a simplified version of the conversation history
            const simplifiedHistory = this.conversationHistory.map(msg => ({
                content: msg.content,
                isUser: msg.isUser
            }));
            requestParams.conversationHistory = JSON.stringify(simplifiedHistory);
        }
        
        // Send request to generate summary
        handleRequest(requestParams)
            .then(result => {
                this.conversationSummary = result;
                console.log('Conversation summarized successfully');
                
                // If in Flow context, update the output attribute
                if (this.conversationOutput !== undefined) {
                    this.conversationOutput = JSON.stringify(this.conversationData);
                }
            })
            .catch(error => {
                console.error('Error summarizing conversation:', error);
                // If error, create a basic summary instead
                this.conversationSummary = `A conversation with ${this.conversationHistory.length} messages.`;
            })
            .finally(() => {
                this.isSummarizing = false;
            });
    }

    // Add a message to conversation history, maintaining the maximum limit
    addMessageToHistory(message) {
        this.messagesTotalCount++;
        
        // Add the new message
        this.conversationHistory.push(message);
        
        // If we exceed the limit, remove oldest messages
        if (this.conversationHistory.length > MAX_HISTORY_MESSAGES) {
            this.conversationHistory = this.conversationHistory.slice(
                this.conversationHistory.length - MAX_HISTORY_MESSAGES
            );
        }
        
        // If we have more than 10 messages and don't have a summary yet,
        // or if we have 10 more messages since the last summary, generate a new one
        if (this.conversationHistory.length >= 10 && 
            (!this.conversationSummary || this.conversationHistory.length % 10 === 0)) {
            this.summarizeConversation();
        }
        
        // If running in Flow context, update the output attribute
        if (this.conversationOutput !== undefined) {
            this.conversationOutput = JSON.stringify(this.conversationData);
        }
    }

    // Provide feedback on user actions
    provideFeedback(element, successMessage) {
        // Add ripple effect
        const ripple = document.createElement('span');
        ripple.classList.add('ripple-effect');
        
        // For custom buttons, add ripple as a child
        if (element.classList.contains('custom-button')) {
            element.appendChild(ripple);
            
            // Calculate ripple position
            const rect = element.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            // Get coordinates from element's bounding rect for safer positioning
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            ripple.style.width = ripple.style.height = `${size}px`;
            ripple.style.left = `${centerX - size / 2}px`;
            ripple.style.top = `${centerY - size / 2}px`;
        } else {
            // For lightning components
            element.appendChild(ripple);
        }
        
        // Show brief toast feedback
        this.dispatchEvent(new ShowToastEvent({
            title: 'Success',
            message: successMessage,
            variant: 'success',
            mode: 'dismissable',
            duration: 1000 // Shorter duration for better UX
        }));
        
        // Remove ripple after animation completes
        setTimeout(() => {
            ripple.remove();
        }, 500);
    }
    
    // Setup cache management for performance
    setupCacheManagement() {
        // Clean up caches periodically to prevent memory leaks
        this._cacheCleanupInterval = setInterval(() => {
            // Clear color cache if it gets too large
            if (this.colorCache && this.colorCache.size > 100) {
                console.log('Cleaning up color cache');
                this.colorCache.clear();
            }
            
            // Clear style cache
            this.styleCache = null;
            
            // Clear old record context cache if record has changed
            if (this._cachedRecordContextId && this._cachedRecordContextId !== this.effectiveRecordId) {
                this._cachedRecordContext = null;
                this._cachedRecordContextId = null;
            }
        }, 300000); // Clean every 5 minutes
    }
    
    disconnectedCallback() {
        // Clean up intervals and caches when component is destroyed
        if (this._cacheCleanupInterval) {
            clearInterval(this._cacheCleanupInterval);
        }
        if (this.comparisonInputTimeout) {
            clearTimeout(this.comparisonInputTimeout);
        }
        
        // Clear all caches
        this.colorCache?.clear();
        this._cachedRecordContext = null;
        this._cachedRecordContextId = null;
        this._cachedPageComponents = null;
    }

    connectedCallback() {
        console.log('LLM Assistant connected');
        // Initialize cache cleanup interval for memory management
        this.setupCacheManagement();
        
        // Load Chart.js library
        this.loadChartJS();
        
        // Preload LLM configurations when connected
        this.loadLLMConfigurations();
        // Load object metadata when component is connected
        this.loadObjectMetadata();
        // Load PDF attachments if on a record page
        if (this.effectiveRecordId) {
            this.loadPdfAttachments();
        }
        
        // Check for auto-comparison on initial load
        this.checkAutoComparison();
        
        // Setup debounced handlers
        this.debouncedPromptChange = this.debounce((event) => {
            this.userPrompt = event.detail.value;
        }, 300); // 300ms debounce

        // If the component is on a record page and has a recordId, get the object API name
        if (this.effectiveRecordId) {
            // The first 3 characters of a Salesforce ID represent the object's key prefix
            this.objectApiName = this.effectiveRecordId.substring(0, 3);
            console.log('Record ID detected:', this.effectiveRecordId);
            console.log('Object API Name key prefix:', this.objectApiName);
        }
    }

    // Load Chart.js library
    loadChartJS() {
        loadScript(this, chartjs)
            .then(() => {
                console.log('Chart.js loaded successfully');
                // Chart.js is now available globally as Chart
            })
            .catch(error => {
                console.error('Error loading Chart.js:', error);
                this.showErrorToast('Chart Library Error', 'Failed to load Chart.js library', 'error');
            });
    }
    
    renderedCallback() {
        if (!this.pageComponentsScanned && this.recordId) {
            // Use requestAnimationFrame for better timing with UI updates
            requestAnimationFrame(() => {
                this.pageComponents = this.getDOMInformation();
                this.pageComponentsScanned = true;
            });
        } else if (!this.recordId) {
            // Set as scanned if we're not on a record page
            this.pageComponentsScanned = true;
        }
        
        // Try to detect and integrate with Nuvitek theme if available
        this.applyThemeIntegration();
        
        // Check for auto-comparison after render
        this.checkAutoComparison();
    }
    
    applyThemeIntegration() {
        try {
            // Try to detect Nuvitek theme container
            const themeContainer = document.querySelector('.nuvitek-theme-container');
            if (themeContainer) {
                const computedStyle = getComputedStyle(themeContainer);
                const themeColor = computedStyle.getPropertyValue('--primary-color').trim();
                const themeAccent = computedStyle.getPropertyValue('--accent-color').trim();
                
                // Only override if we detected values and user hasn't specified custom colors
                if (themeColor && this.primaryColor === '#22BDC1') {
                    this.primaryColor = themeColor;
                }
                if (themeAccent && this.accentColor === '#D5DF23') {
                    this.accentColor = themeAccent;
                }
                
                // Check if theme is dark and adjust accordingly
                const isDarkTheme = themeContainer.classList.contains('theme-dark');
                if (isDarkTheme) {
                    this.template.host.classList.add('theme-dark');
                }
            }
        } catch (error) {
            console.error('Error detecting theme:', error);
        }
    }
    
    // Debounce function to limit frequency of calls
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Load LLM configurations once instead of using wire that might re-run
    loadLLMConfigurations() {
        console.log('🔄 loadLLMConfigurations START');
        getLLMConfigurations()
            .then(data => {
                console.log('📥 Raw LLM configurations from Apex:', data);
                if (data && data.length > 0) {
                    // Map configurations to combobox options
                    this.llmOptions = data.map(config => ({
                        label: config.MasterLabel,
                        value: config.DeveloperName,
                        provider: config.Provider__c,
                        supportsFiles: config.Supports_Files__c
                    }));
                    
                    console.log('✅ LLM configuration options loaded:', this.llmOptions.length);
                    console.log('📋 Mapped options:', JSON.stringify(this.llmOptions));
                    
                    // Set default model if specified in design attributes, or use the first model
                    if (this.defaultModelName && this.llmOptions.some(opt => opt.value === this.defaultModelName)) {
                        this.selectedLLM = this.defaultModelName;
                        console.log('🎯 Using default model:', this.defaultModelName);
                    } else if (this.llmOptions.length > 0) {
                        this.selectedLLM = this.llmOptions[0].value;
                        console.log('🎯 Using first available model:', this.selectedLLM);
                    }
                    
                    // Set the label after selecting the model
                    if (this.selectedLLM) {
                        const selectedOption = this.llmOptions.find(opt => opt.value === this.selectedLLM);
                        this.selectedLLMLabel = selectedOption ? selectedOption.label : 'Unknown Model';
                        
                        console.log('✅ Model selection complete:');
                        console.log('  - selectedLLM:', this.selectedLLM);
                        console.log('  - selectedLLMLabel:', this.selectedLLMLabel);
                        console.log('  - Full selectedOption:', selectedOption);
                        
                        // For a record page, perform an initial anomaly check
                        if (this.enableAnomalyDetection && this.effectiveRecordId) {
                            this.performInitialAnomalyCheck();
                        }
                    } else {
                        console.warn('⚠️ No model selected!');
                    }
                } else {
                    console.warn('No LLM configurations found');
                }
            })
            .catch(error => {
                console.error('❌ ERROR loading LLM configurations:', error);
                console.error('🔍 Error details:', {
                    body: error.body,
                    message: error.body?.message,
                    stack: error.stack
                });
                this.showError(error.body?.message || 'Error fetching LLM configurations');
            });
    }

    handlePromptChange(event) {
        // Use the debounced version to avoid excessive state updates
        this.debouncedPromptChange(event);
    }
    
    handleModelChange(event) {
        console.log('🔄 handleModelChange START');
        console.log('📋 Event detail:', event.detail);
        console.log('📋 New value:', event.detail.value);
        
        this.selectedLLM = event.detail.value;
        const selectedOption = this.llmOptions.find(opt => opt.value === this.selectedLLM);
        this.selectedLLMLabel = selectedOption ? selectedOption.label : 'Unknown Model';
        
        console.log('✅ Model changed successfully:');
        console.log('  - selectedLLM (DeveloperName):', this.selectedLLM);
        console.log('  - selectedLLMLabel (MasterLabel):', this.selectedLLMLabel);
        console.log('  - selectedOption:', selectedOption);
        // --- Trigger anomaly check if the model is changed manually and hasn't run yet ---
        // This ensures it runs even if the default/first selection failed or wasn't ready
        if (!this.anomalyCheckResult && !this.anomalyCheckLoading) {
            this.performInitialAnomalyCheck();
        }
    }

    // Adjust a hex color by a percentage amount (more efficient version)
    adjustColor(color, amount) {
        // Check cache first for performance
        const cacheKey = `adjust_${color}_${amount}`;
        if (this.colorCache.has(cacheKey)) {
            return this.colorCache.get(cacheKey);
        }
        
        if (!color || !color.startsWith('#')) {
            return color; // Return unchanged if invalid
        }
        
        let hex = color.slice(1);
        
        // Normalize to 6 digits
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        
        // Parse hex to RGB value directly
        let r = parseInt(hex.slice(0, 2), 16);
        let g = parseInt(hex.slice(2, 4), 16);
        let b = parseInt(hex.slice(4, 6), 16);
        
        // Adjust each channel by percentage
        r = Math.max(0, Math.min(255, r + amount));
        g = Math.max(0, Math.min(255, g + amount));
        b = Math.max(0, Math.min(255, b + amount));
        
        // Convert back to hex using template string for efficiency
        const result = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        
        // Cache the result
        this.colorCache.set(cacheKey, result);
        return result;
    }

    handleAsk() {
        this.handleLLMRequest('ask');
    }

    handleSummarize() {
        this.handleLLMRequest('summarize');
    }
    
    handleComparisonCheck() {
        // Show the modal for comparison input
        this.showComparisonModal = true;
    }
    
    handleComparisonInputChange(event) {
        // Use debouncing for better performance on large text inputs
        if (this.comparisonInputTimeout) {
            clearTimeout(this.comparisonInputTimeout);
        }
        
        this.comparisonInputTimeout = setTimeout(() => {
            this.comparisonInput = event.detail.value;
        }, 300);
    }
    
    handleComparisonModalCancel() {
        this.showComparisonModal = false;
        this.comparisonInput = '';
    }
    
    async handleComparisonModalConfirm() {
        if (!this.comparisonInput || !this.comparisonInput.trim()) {
            this.showError('Please provide input to compare');
            return;
        }
        
        this.showComparisonModal = false;
        this.comparisonCheckLoading = true;
        this.showComparisonBanner = false;
        
        try {
            // Parse the comparison rules
            let rulesObj = {};
            try {
                rulesObj = JSON.parse(this.comparisonRules);
            } catch (e) {
                // If not valid JSON, treat as plain text rules
                rulesObj = { rules: this.comparisonRules };
            }
            
            // Build the comparison prompt with system context at the forefront
            const systemContext = this.buildSystemPrompt('comparison');
            const comparisonPrompt = `${systemContext}You are an expert evaluator assessing whether submitted content meets specified standards and requirements.

EVALUATION CRITERIA/RULES:
${JSON.stringify(rulesObj, null, 2)}

CONTENT TO EVALUATE:
${this.comparisonInput}

${this.recordId ? '\nADDITIONAL CONTEXT:\n' + (await this.getRecordContextForComparison()) : ''}

EVALUATION INSTRUCTIONS:
1. Carefully review each requirement/criterion in the rules
2. Assess how the submitted content addresses each point
3. Consider both explicit requirements and implied quality standards
4. Be objective and specific in your assessment
5. MOST IMPORTANTLY: Follow your PRIMARY DIRECTIVE in how you approach this evaluation

RESPONSE FORMAT:
Begin with either "MEETS STANDARDS" or "DOES NOT MEET STANDARDS"

Then provide:
✓ **Overall Assessment**: Brief summary of compliance level
✓ **Detailed Analysis**: 
  - For each criterion, state if it's MET, PARTIALLY MET, or NOT MET
  - Provide specific examples from the content
  - Quote relevant passages when applicable
✓ **Strengths**: What the submission does well
✓ **Gaps/Weaknesses**: What's missing or inadequate
✓ **Improvement Recommendations**: Specific, actionable suggestions

Use clear formatting with bullet points and bold headers for readability.`;
            
            // Call the LLM to perform comparison
            const result = await handleRequest({
                recordId: this.recordId || '',
                configName: this.selectedLLM,
                prompt: comparisonPrompt,
                operation: 'ask',
                relatedObjects: ''
            });
            
            this.comparisonCheckResult = result;
            
            // Parse the result to show detailed accordion
            if (result) {
                const meetsStandards = result.toUpperCase().includes('MEETS STANDARDS');
                this.showComparisonBanner = true;
                this.comparisonBannerMessage = meetsStandards 
                    ? 'MEETS' 
                    : 'DOES NOT MEET';
                
                // Format the detailed result for rich text display
                this.comparisonDetailedResult = this.formatComparisonResult(result);
                
                // Automatically open the accordion when results are available
                this.activeAccordionSections = ['comparisonSection'];
                
                // Add the full analysis to conversation
                this.addMessageToHistory({
                    id: this.generateMessageId(),
                    content: `Comparison Analysis Request:\n${this.comparisonInput}`,
                    formattedContent: this.getFormattedMessageContent(`Comparison Analysis Request:\n${this.comparisonInput}`),
                    sender: 'User',
                    model: '',
                    timestamp: this.getFormattedTimestamp(),
                    isUser: true
                });
                
                this.addMessageToHistory({
                    id: this.generateMessageId(),
                    content: result,
                    formattedContent: this.getFormattedMessageContent(result),
                    sender: 'AI',
                    model: this.selectedLLMLabel,
                    timestamp: this.getFormattedTimestamp(),
                    isUser: false
                });
                
                // Scroll to bottom
                this.scrollToBottom();
            }
            
        } catch (error) {
            console.error('Error during comparison check:', error);
            this.showError('Failed to perform comparison: ' + this.getErrorMessage(error));
        } finally {
            this.comparisonCheckLoading = false;
            this.comparisonInput = '';
        }
    }
    
    // Check and trigger auto-comparison if needed
    checkAutoComparison() {
        // Skip if already running, no model selected, or conditions not met
        if (this.comparisonCheckLoading || !this.selectedLLM || !this.shouldRunAutoComparison) {
            return;
        }
        
        // Skip if we already have a result and inputs haven't changed
        if (this.comparisonCheckResult && 
            this._lastCompareFrom === this.compareFrom && 
            this._lastComparisonRules === this.comparisonRules) {
            return;
        }
        
        console.log('Auto-comparison conditions met, triggering comparison...');
        this.performAutoComparison();
    }
    
    async performAutoComparison() {
        if (!this.shouldRunAutoComparison || this.comparisonCheckLoading) {
            return;
        }
        
        // Get the content to compare - either from compareFrom or the current record
        let contentToCompare = this.compareFrom;
        if (!contentToCompare && this.effectiveRecordId) {
            // Fetch record data if compareFrom is not provided
            contentToCompare = await this.getRecordContextForComparison();
        }
        
        console.log('Performing auto-comparison with:', contentToCompare ? contentToCompare.substring(0, 50) + '...' : 'record data');
        
        this.comparisonCheckLoading = true;
        this.showComparisonBanner = false;
        
        // Cache the current values to detect changes
        this._lastCompareFrom = this.compareFrom;
        this._lastComparisonRules = this.comparisonRules;
        
        try {
            // Parse the comparison rules  
            let rulesObj = {};
            try {
                rulesObj = JSON.parse(this.comparisonRules);
            } catch (e) {
                // If not valid JSON, treat as plain text rules
                rulesObj = { rules: this.comparisonRules };
            }
            
            // Build the auto-comparison prompt with system context at the forefront
            const systemContext = this.buildSystemPrompt('comparison');
            const autoComparisonPrompt = `${systemContext}You are an expert evaluator assessing whether submitted content meets specified standards and requirements.

EVALUATION CRITERIA/RULES:
${JSON.stringify(rulesObj, null, 2)}

CONTENT TO EVALUATE:
${contentToCompare}

${this.recordId && this.compareFrom ? '\nADDITIONAL CONTEXT:\n' + (await this.getRecordContextForComparison()) : ''}

EVALUATION INSTRUCTIONS:
1. Carefully review each requirement/criterion in the rules
2. Assess how the submitted content addresses each point
3. Consider both explicit requirements and implied quality standards
4. Be objective and specific in your assessment
5. MOST IMPORTANTLY: Follow your PRIMARY DIRECTIVE in how you approach this evaluation

RESPONSE FORMAT:
Begin with either "MEETS STANDARDS" or "DOES NOT MEET STANDARDS"

Then provide:
✓ **Overall Assessment**: Brief summary of compliance level
✓ **Detailed Analysis**: 
  - For each criterion, state if it's MET, PARTIALLY MET, or NOT MET
  - Provide specific examples from the content
  - Quote relevant passages when applicable
✓ **Strengths**: What the submission does well
✓ **Gaps/Weaknesses**: What's missing or inadequate
✓ **Improvement Recommendations**: Specific, actionable suggestions

Use clear formatting with bullet points and bold headers for readability.`;
            
            // Call the LLM to perform auto-comparison
            const result = await handleRequest({
                recordId: this.recordId || '',
                configName: this.selectedLLM,
                prompt: autoComparisonPrompt,
                operation: 'ask',
                relatedObjects: ''
            });
            
            this.comparisonCheckResult = result;
            
            // Parse the result to show detailed accordion
            if (result) {
                const meetsStandards = result.toUpperCase().includes('MEETS STANDARDS');
                this.showComparisonBanner = true;
                this.comparisonBannerMessage = meetsStandards 
                    ? 'MEETS' 
                    : 'DOES NOT MEET';
                
                // Format the detailed result for rich text display
                this.comparisonDetailedResult = this.formatComparisonResult(result);
                
                // Automatically open the accordion when results are available
                this.activeAccordionSections = ['comparisonSection'];
                
                console.log('Auto-comparison completed:', this.comparisonBannerMessage);
            }
            
        } catch (error) {
            console.error('Error during auto-comparison:', error);
            this.showComparisonBanner = true;
            this.comparisonBannerMessage = 'Auto-comparison failed: ' + this.getErrorMessage(error);
        } finally {
            this.comparisonCheckLoading = false;
        }
    }
    
    // Format comparison result for rich text display
    formatComparisonResult(result) {
        if (!result) return '';
        
        // Convert the text result to HTML for better formatting
        let formatted = result;
        
        // Convert markdown-style headers to HTML
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Convert bullet points to HTML lists
        const lines = formatted.split('\n');
        let inList = false;
        let htmlLines = [];
        
        for (let line of lines) {
            line = line.trim();
            
            // Check if line starts with bullet point indicators
            if (line.match(/^[•▪▫-]\s/) || line.match(/^✓\s/) || line.match(/^⚠\s/) || line.match(/^✗\s/)) {
                if (!inList) {
                    htmlLines.push('<ul>');
                    inList = true;
                }
                // Remove bullet and add as list item
                const cleanLine = line.replace(/^[•▪▫-✓⚠✗]\s*/, '');
                htmlLines.push(`<li>${cleanLine}</li>`);
            } else if (line === '' && inList) {
                // End list on empty line
                htmlLines.push('</ul>');
                inList = false;
                htmlLines.push('<br/>');
            } else {
                if (inList) {
                    htmlLines.push('</ul>');
                    inList = false;
                }
                
                if (line === '') {
                    htmlLines.push('<br/>');
                } else {
                    htmlLines.push(`<p>${line}</p>`);
                }
            }
        }
        
        // Close any remaining open list
        if (inList) {
            htmlLines.push('</ul>');
        }
        
        return htmlLines.join('');
    }
    
    // Build primary system prompt that puts contextPrompt at the absolute forefront
    buildSystemPrompt(operationType = 'general') {
        let systemPrompt = '';
        
        // FIRST AND FOREMOST: User's custom context takes absolute priority
        if (this.contextPrompt && this.contextPrompt.trim() !== '') {
            systemPrompt = `PRIMARY DIRECTIVE - THIS IS YOUR MOST IMPORTANT INSTRUCTION:
${this.contextPrompt}

CRITICAL: You MUST follow the above directive in every response. This is your specialized role and purpose. Let this directive shape how you approach every task, analysis, and response.

`;
        }
        
        // Add operation-specific context that supports the primary directive
        switch (operationType) {
            case 'comparison':
                systemPrompt += `CURRENT TASK: Standards comparison and compliance evaluation.
Remember: Apply your PRIMARY DIRECTIVE while performing this comparison analysis.

`;
                break;
            case 'anomaly':
                systemPrompt += `CURRENT TASK: Anomaly detection and pattern analysis.
Remember: Apply your PRIMARY DIRECTIVE while identifying potential issues.

`;
                break;
            case 'analysis':
                systemPrompt += `CURRENT TASK: Comprehensive record analysis.
Remember: Apply your PRIMARY DIRECTIVE while analyzing this record.

`;
                break;
            case 'image':
                systemPrompt += `CURRENT TASK: Image and visual content analysis.
Remember: Apply your PRIMARY DIRECTIVE while processing visual content.

`;
                break;
            case 'document':
                systemPrompt += `CURRENT TASK: Document processing and data extraction.
Remember: Apply your PRIMARY DIRECTIVE while analyzing documents.

`;
                break;
            default:
                systemPrompt += `CURRENT TASK: General AI assistance and question answering.
Remember: Apply your PRIMARY DIRECTIVE in all interactions.

`;
        }
        
        return systemPrompt;
    }
    
    async getRecordContextForComparison() {
        // Get basic record context if available
        if (!this.recordId) return '';
        
        // Use cached context if available and for the same record
        if (this._cachedRecordContext && this._cachedRecordContextId === this.recordId) {
            console.log('Using cached record context');
            return this._cachedRecordContext;
        }
        
        try {
            const result = await handleRequest({
                recordId: this.recordId,
                configName: this.selectedLLM,
                prompt: 'Provide a concise summary of this record including: record type, key identifiers, current status/stage, important dates, key stakeholders, and any critical values or flags. Focus on information relevant for evaluating compliance or standards.',
                operation: 'summarize',
                relatedObjects: this.relatedObjects
            });
            
            // Cache the result
            this._cachedRecordContext = result || '';
            this._cachedRecordContextId = this.recordId;
            
            return this._cachedRecordContext;
        } catch (error) {
            console.error('Error getting record context for comparison:', error);
            return '';
        }
    }

    handleAnalyzeImages() {
        if (!this.recordId) {
            this.showError('Record ID is required to analyze images');
            return;
        }
        
        // Clear any prior errors
        this.clearErrors();
        
        // Show loading state
        this.isLoading = true;
        
        // Build image analysis prompt with system context at the forefront
        const systemContext = this.buildSystemPrompt('image');
        let imageAnalysisUserPrompt = `${systemContext}**EXPERT IMAGE ANALYSIS PROTOCOL**

You are an expert visual analyst. Provide comprehensive analysis following this structure:

**CONTENT OVERVIEW:**
• Primary subject and purpose of the image
• Type of document/image (form, chart, photo, etc.)
• Overall quality and legibility assessment

**TEXT EXTRACTION & OCR:**
• Transcribe ALL visible text with exact formatting
• Include headers, labels, values, and fine print
• Note any text that's unclear or partially obscured
• Preserve spatial relationships (tables, forms, lists)

**VISUAL ELEMENTS:**
• Signatures, stamps, seals, or official markings
• Charts, graphs, diagrams, or technical illustrations  
• People, objects, or scenes (if applicable)
• Color coding, highlighting, or annotations

**DATA EXTRACTION:**
• Names, dates, amounts, reference numbers
• Status indicators, checkboxes, selections
• Contact information, addresses
• Key identifiers or codes

**QUALITY & INTEGRITY ASSESSMENT:**
• Image clarity and resolution issues
• Signs of alteration, editing, or tampering
• Missing information or incomplete sections
• Potential scanning or photography artifacts

**COMPLIANCE & ANOMALY DETECTION:**
• Unusual patterns or inconsistencies
• Missing required elements (signatures, dates, etc.)
• Formatting or content that seems incorrect
• Red flags requiring attention

REMEMBER: Apply your PRIMARY DIRECTIVE throughout this analysis.

Format your response with clear sections using **bold headers** and bullet points for easy scanning.`;
        // --- END MODIFICATION ---
        
        // Call the Apex controller to process images
        // --- MODIFICATION: Pass the imageAnalysisUserPrompt to Apex --- 
        processImagesWithAI({ 
            recordId: this.effectiveRecordId,
            prompt: imageAnalysisUserPrompt // Pass the determined prompt
        })
            .then(result => {
                // Handle the result - first, clear loading state
                this.isLoading = false;
                
                if (result) {
                    // Format the response
                    this.response = result;
                    
                    // Add to conversation history
                    this.addMessageToHistory({
                        id: this.generateMessageId(),
                        content: 'Please analyze images attached to this record.',
                        formattedContent: 'Please analyze images attached to this record.',
                        sender: 'User',
                        model: '',
                        timestamp: this.getFormattedTimestamp(),
                        isUser: true
                    });
                    
                    this.addMessageToHistory({
                        id: this.generateMessageId(),
                        content: result,
                        formattedContent: result,
                        sender: 'AI',
                        model: this.selectedLLMLabel,
                        timestamp: this.getFormattedTimestamp(),
                        isUser: false
                    });
                    
                    // If an analysis field is configured and the result is non-empty, 
                    // offer to save the analysis
                    if (this.analysisFieldApiName) {
                        this.prepareSynopsisModal(result);
                    }
                    
                    // Scroll to the bottom to show new message
                    this.scrollToBottom();
                } else {
                    this.showError('No response received from AI');
                }
            })
            .catch(error => {
                this.isLoading = false;
                this.showError(`Error during image analysis: ${this.getErrorMessage(error)}`);
            });
    }

    // Replace your existing handleLLMRequest method with this version
    handleLLMRequest(operation) {
        console.log('🚀 handleLLMRequest START - Operation:', operation);
        console.log('📋 Current state:', {
            selectedLLM: this.selectedLLM,
            selectedLLMLabel: this.selectedLLMLabel,
            llmOptions: this.llmOptions,
            recordId: this.recordId,
            effectiveRecordId: this.effectiveRecordId,
            userPrompt: this.userPrompt
        });
        
        if (!this.validateInputs(operation)) {
            console.error('❌ Validation failed');
            return;
        }
        console.log('✅ Validation passed');

        // Clear any prior errors
        this.clearErrors();
        
        // Set loading state
        this.isLoading = true;

        // Prepare basic request parameters - match Apex parameter names exactly
        const requestParams = {
            configName: this.selectedLLM,  // Changed from llmConfigName to configName
            prompt: this.userPrompt,       // Changed from userPrompt to prompt
            operation: operation,
            recordId: '',                  // Initialize with empty string
            relatedObjects: '',            // Initialize with empty string
            reportObjects: ''              // Initialize with empty string for reporting
        };
        
        console.log('📦 Initial requestParams:', JSON.stringify(requestParams));
        console.log('🔍 Specifically checking configName:', requestParams.configName);
        console.log('🔍 Type of configName:', typeof requestParams.configName);

        // Add recordId parameter if available and is not the 'ask' operation
        if (this.effectiveRecordId && operation !== 'ask') {
            requestParams.recordId = this.effectiveRecordId;
        }
        
        // Add page components for context if available
        if (this.pageComponents && this.pageComponents.length > 0) {
            requestParams.pageComponents = JSON.stringify(this.pageComponents);
        }
        
        // Add conversation history if available and has enough messages
        if (this.conversationHistory && this.conversationHistory.length > 0) {
            // Only send a simplified version of the conversation history
            // with just the essential data to reduce payload size
            const simplifiedHistory = this.conversationHistory.map(msg => ({
                content: msg.content,
                isUser: msg.isUser
            }));
            requestParams.conversationHistory = JSON.stringify(simplifiedHistory);
        }
        
        // Add conversation summary if available
        if (this.conversationSummary) {
            requestParams.conversationSummary = this.conversationSummary;
        }
        
        // Build and add system prompt that puts contextPrompt at the forefront
        const systemContext = this.buildSystemPrompt(operation);
        if (systemContext) {
            // Prepend system context to the user prompt to ensure it takes priority
            requestParams.prompt = systemContext + requestParams.prompt;
        }
        
        // Add page components context for better understanding
        if (this.pageComponents && this.pageComponents.length > 0) {
            requestParams.pageContext = `User is currently viewing a Salesforce page with the following components: ${this.pageComponents.join(', ')}. This context may be relevant for understanding their questions.`;
        }
        
        // Add related objects if configured
        if (this.hasRelatedObjects) {
            requestParams.relatedObjects = this.relatedObjects;
        }
        
        // Add report objects if configured
        if (this.reportObjects && this.reportObjects.trim() !== '') {
            requestParams.reportObjects = this.reportObjects;
        }
        
        // Add message to history for user's message
        const messageObj = {
            id: this.generateMessageId(),
            content: this.userPrompt,
            formattedContent: this.getFormattedMessageContent(this.userPrompt),
            sender: 'You',
            timestamp: this.getFormattedTimestamp(),
            isUser: true
        };
        this.addMessageToHistory(messageObj);

        console.log('📤 FINAL LLM Request params before Apex call:', JSON.stringify(requestParams));
        console.log('🔑 Final configName being sent:', requestParams.configName);
        console.log('🔑 Is configName null/undefined?', requestParams.configName == null);
        console.log('🔑 Is configName empty string?', requestParams.configName === '');
        
        // Note: truncateContent handles long prompt text to avoid hitting Apex limits
        requestParams.prompt = this.truncateContent(requestParams.prompt);
        
        console.log('🌐 Calling handleRequest Apex method with params:', requestParams);
        
        // Submit the request to Apex controller
        handleRequest(requestParams)
            .then(result => {
                console.log('✅ LLM Response SUCCESS, operation:', operation);
                console.log('📥 Response result:', result);
                
                // For summarize operations, we open the analysis modal
                if (operation === 'summarize' && this.analysisFieldApiName && this.analysisFieldApiName.trim() !== '') {
                    this.prepareSynopsisModal(result);
                } else {
                    // Set the response and add to conversation history
                    this.response = result;
                    
                    // Create message object for AI response
                    const aiMessageObj = {
                        id: this.generateMessageId(),
                        content: result,
                        formattedContent: this.getFormattedMessageContent(result),
                        sender: 'AI Assistant',
                        timestamp: this.getFormattedTimestamp(),
                        isUser: false,
                        model: this.selectedLLMLabel
                    };
                    this.addMessageToHistory(aiMessageObj);
                    
                    // Clear user input after successful response
                    this.userPrompt = '';
                    
                    // If running in Flow context, update output variable
                    if (this.conversationOutput !== undefined) {
                        this.conversationOutput = JSON.stringify(this.conversationData);
                    }
                    
                    // Apply ripple effect for visual feedback
                    const askButton = this.template.querySelector('.primary-button');
                    if (askButton) {
                        this.provideFeedback(askButton, 'Response received');
                    }
                }
                
                // Scroll to bottom of conversation
                this.scrollToBottom();
            })
            .catch(error => {
                console.error('❌ ERROR in LLM request:', error);
                console.error('🔍 Error details:', {
                    status: error.status,
                    statusText: error.statusText,
                    body: error.body,
                    message: error.body?.message,
                    stack: error.stack
                });
                console.error('📋 Request params that caused error:', requestParams);
                console.error('🔑 configName in error state:', requestParams.configName);
                this.showError(this.getErrorMessage(error));
            })
            .finally(() => {
                this.isLoading = false;
            });
    }
    
    // Helper to scroll to bottom of conversation
    scrollToBottom() {
        setTimeout(() => {
            const chatContainer = this.template.querySelector('.conversation-container');
            if (chatContainer) {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
        }, 100);
    }

    truncateContent(content, maxSize = 150000) { // Using 150000 to leave room for response
        if (!content) return '';
        
        // Rough approximation of tokens (4 characters ≈ 1 token)
        const approxTokenLength = Math.ceil(content.length / 4);
        
        if (approxTokenLength <= maxSize) {
            return content;
        }
    
        // If it's too long, truncate while preserving structure
        const sections = content.split('\n\n');
        let truncatedContent = '';
        let currentSize = 0;
    
        for (const section of sections) {
            const sectionTokens = Math.ceil(section.length / 4);
            if (currentSize + sectionTokens > maxSize) {
                break;
            }
            truncatedContent += section + '\n\n';
            currentSize += sectionTokens;
        }
    
        return truncatedContent + '\n[Content truncated due to length limitations]';
    }

    validateInputs(operation) {
        console.log('🔍 validateInputs START');
        console.log('  - operation:', operation);
        console.log('  - selectedLLM:', this.selectedLLM);
        console.log('  - effectiveRecordId:', this.effectiveRecordId);
        console.log('  - userPrompt:', this.userPrompt);
        
        // When analyzing a record, we need a recordId
        if (operation === 'summarize' && !this.effectiveRecordId) {
            console.error('❌ Validation failed: No record ID for summarize operation');
            this.showError('No record ID available for analysis');
            return false;
        }
        
        // Model selection is always required
        if (!this.selectedLLM) {
            console.error('❌ Validation failed: No LLM selected');
            console.error('  - selectedLLM value:', this.selectedLLM);
            console.error('  - llmOptions:', this.llmOptions);
            this.showError('Please select an AI model first');
            return false;
        }
        
        // User prompt is required for asking questions
        if (operation === 'ask' && !this.userPrompt?.trim()) {
            this.showError('Please enter a question');
            return false;
        }
        
        // Check prompt length
        if (this.userPrompt && this.userPrompt.length > 32000) {
            this.showError('Question is too long');
            return false;
        }
        
        return true;
    }

    showError(message) {
        console.error('Error:', message);
        this.hasError = true;
        this.errorMessage = message;
        
        // Also show a toast notification
        this.dispatchEvent(new ShowToastEvent({
            title: 'Error',
            message: message,
            variant: 'error'
        }));
        
        setTimeout(() => this.clearErrors(), 5000);
    }

    clearErrors() {
        this.hasError = false;
        this.errorMessage = '';
    }

    // Helper method to render response with formatting
    get formattedResponse() {
        if (!this.response) return '';
        
        // Replace newlines with HTML breaks
        let formatted = this.response.replace(/\n/g, '<br />');
        
        // Remove any "User:" prefixes that might have slipped through
        formatted = formatted.replace(/User:\s+/g, '');
        formatted = formatted.replace(/You:\s+/g, '');
        
        return formatted;
    }
    
    // Utility method to copy text to clipboard
    async copyToClipboard(text, target, successMessage) {
        if (!text) return false;
        
        try {
            // Use modern Clipboard API if available
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                this.provideFeedback(target, successMessage);
                return true;
            } else {
                // For non-secure contexts, show a message instead of using deprecated API
                this.showError('Clipboard access requires HTTPS. Please copy the text manually.');
                return false;
            }
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            this.showError('Failed to copy to clipboard. Please copy the text manually.');
            return false;
        }
    }

    // Copy response to clipboard
    async copyResponseToClipboard(event) {
        await this.copyToClipboard(this.response, event.target, 'Response copied to clipboard');
    }

    // Copy a specific message to clipboard
    async copyMessageToClipboard(event) {
        const message = event.currentTarget.dataset.message;
        await this.copyToClipboard(message, event.target, 'Message copied to clipboard');
    }

    // Get information about page components - optimized version
    getDOMInformation() {
        // Skip scanning if it's already been done
        if (this.pageComponentsScanned && this.pageComponents.length > 0) {
            return this.pageComponents.join('\n');
        }
        
        const pageContent = [];
        
        try {
            // Get the entire page container more efficiently with a direct selector
            const componentSelector = 'one-record-home-flexipage2, one-record-home-flexipage';
            const pageContainer = document.querySelector(componentSelector);
            
            if (pageContainer) {
                // Create a single cached NodeList for each component type
                
                // Get lightning cards - use attribute selector for efficiency
                const cards = document.querySelectorAll('lightning-card[title]');
                if (cards.length) {
                    pageContent.push('Lightning Cards:');
                    Array.from(cards).forEach(card => {
                        const title = card.title || card.getAttribute('title') || 'Untitled Card';
                        pageContent.push(`- ${title}`);
                    });
                }

                // Get tabs more efficiently with a specific selector
                const tabs = document.querySelectorAll('lightning-tab[label]');
                if (tabs.length) {
                    pageContent.push('Tabs:');
                    Array.from(tabs).forEach(tab => {
                        const label = tab.label || tab.getAttribute('label') || 'Untitled Tab';
                        pageContent.push(`- ${label}`);
                    });
                }

                // Get related lists
                const relatedLists = document.querySelectorAll('lightning-related-list[title]');
                if (relatedLists.length) {
                    pageContent.push('Related Lists:');
                    Array.from(relatedLists).forEach(list => {
                        const title = list.getAttribute('title') || 'Untitled Related List';
                        pageContent.push(`- ${title}`);
                    });
                }

                // Get actions more efficiently with specific selector
                const quickActions = document.querySelectorAll('lightning-action-bar lightning-button[label]');
                if (quickActions.length) {
                    pageContent.push('Quick Actions:');
                    Array.from(quickActions).forEach(action => {
                        const label = action.label || action.getAttribute('label') || 'Untitled Action';
                        pageContent.push(`- ${label}`);
                    });
                }

                // Get custom components (those starting with 'c-')
                // Use a more efficient attribute-starts-with selector
                const customComponents = document.querySelectorAll('[data-component-id^="c-"]');
                if (customComponents.length) {
                    pageContent.push('Custom Components:');
                    // Convert to array once and then map directly
                    const componentIds = Array.from(customComponents)
                        .map(comp => comp.getAttribute('data-component-id'))
                        .filter(id => id); // Filter out null/undefined
                    
                    // Use Set to remove duplicates
                    new Set(componentIds).forEach(id => {
                        pageContent.push(`- ${id}`);
                    });
                }
            }
            
            // Store the scanned data for future use
            this.pageComponents = pageContent;
            this.pageComponentsScanned = true;
            
        } catch (error) {
            console.error('Error gathering DOM information:', error);
            pageContent.push('Error gathering page component information');
            // Don't mark as scanned on error so we'll try again next time
            this.pageComponentsScanned = false;
        }

        return pageContent.join('\n');
    }

    // Convert hex color to RGB values - optimized version
    hexToRgb(hex) {
        // Check cache first
        const cacheKey = `rgb_${hex}`;
        if (this.colorCache.has(cacheKey)) {
            return this.colorCache.get(cacheKey);
        }
        
        // Default fallback
        if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) {
            return '34, 189, 193';
        }
        
        let r, g, b;
        
        // Handle different hex formats efficiently
        if (hex.length === 4) {
            // #RGB format
            r = parseInt(hex.charAt(1) + hex.charAt(1), 16);
            g = parseInt(hex.charAt(2) + hex.charAt(2), 16);
            b = parseInt(hex.charAt(3) + hex.charAt(3), 16);
        } else if (hex.length === 7) {
            // #RRGGBB format
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        } else {
            // Invalid format
            return '34, 189, 193';
        }
        
        const result = `${r}, ${g}, ${b}`;
        
        // Cache the result
        this.colorCache.set(cacheKey, result);
        return result;
    }

    // Perform the initial anomaly check when the component has the recordId and a model selected
    async performInitialAnomalyCheck() {
        // Only run if anomaly detection is enabled, we have a recordId and a selected LLM
        if (!this.enableAnomalyDetection || !this.effectiveRecordId || !this.selectedLLM || this.anomalyCheckLoading) {
            console.log('Anomaly check skipped: ' + 
                (!this.enableAnomalyDetection ? 'Anomaly detection disabled, ' : '') +
                (!this.effectiveRecordId ? 'Missing recordId, ' : '') + 
                (!this.selectedLLM ? 'No LLM selected, ' : '') + 
                (this.anomalyCheckLoading ? 'Already loading' : ''));
            return;
        }
        
        console.log('Performing initial anomaly check...');
        this.anomalyCheckLoading = true;
        this.showAnomalyBanner = false; // Reset banner state
        this.anomalyBannerMessage = ''; // Clear previous message
        this.anomalyCheckResult = '';   // Clear previous result

        try {
            // Check if document analysis is enabled and if there are PDF documents available
            let pdfDocumentIds = [];
            let modelToUse = this.selectedLLM;
            
            // If document analysis is enabled and we have PDFs, we'll send the PDF document IDs directly
            if (this.enableDocumentAnalysis && this.hasPdfDocuments) {
                console.log('Document analysis enabled for anomaly detection. Collecting document IDs...');
                
                // Apply document limits - sort documents by size if possible and take the first few
                // For simplicity, we'll just limit the number of documents here to the first 3
                const MAX_DOCUMENTS_TO_ANALYZE = 3;
                
                // Collect PDF document IDs to pass directly to the Apex method
                pdfDocumentIds = this.pdfDocuments
                    .slice(0, MAX_DOCUMENTS_TO_ANALYZE)
                    .map(doc => doc.id);
                
                console.log(`Using ${pdfDocumentIds.length} of ${this.pdfDocuments.length} PDF document(s) for anomaly analysis (limit: ${MAX_DOCUMENTS_TO_ANALYZE})`);
                
                // Use Vision model for anomaly detection when documents are available
                modelToUse = 'OpenAI_GPT4_Vision';
                console.log('Using Vision model for anomaly detection: ' + modelToUse);
                
                // Display a warning if we had to limit documents
                if (this.pdfDocuments.length > MAX_DOCUMENTS_TO_ANALYZE) {
                    console.warn(`Limited analysis to ${MAX_DOCUMENTS_TO_ANALYZE} documents to avoid size limits.`);
                }
            }

            // Build anomaly detection prompt with system context at the forefront
            const systemContext = this.buildSystemPrompt('anomaly');
            let anomalyPrompt = systemContext;
            
            // Call the Apex method directly with the PDF document IDs
            const result = await checkRecordForAnomalies({ 
                recordId: this.effectiveRecordId, 
                configName: modelToUse,
                relatedObjects: this.relatedObjects,
                pdfDocumentIds: pdfDocumentIds,
                customPrompt: anomalyPrompt || ''
            });

            console.log('Anomaly check result received:', result);
            this.anomalyCheckResult = result; // Store the raw result
            
            // Check if the result indicates an anomaly (starts with "YES")
            if (result && result.toUpperCase().startsWith('YES')) {
                this.showAnomalyBanner = true;
                // Extract the explanation part after "YES - "
                this.anomalyBannerMessage = result.substring(result.indexOf('-') + 1).trim(); 
                console.log('Anomaly detected, banner will be shown:', this.anomalyBannerMessage);
                // Automatically open the accordion when an issue is detected
                this.activeAccordionSections = ['anomalySection']; 
            } else {
                this.showAnomalyBanner = false;
                console.log('No anomalies detected by initial check.');
                // Ensure accordion is closed if no issue
                this.activeAccordionSections = []; 
            }

        } catch (error) {
            // Handle errors during the anomaly check
            console.error('Error during initial anomaly check:', error);
            
            let errorMessage = this.getErrorMessage(error);
            console.error('Error details:', errorMessage);
            
            // Check for specific error messages related to document size
            if (errorMessage && (
                errorMessage.includes('size limits') || 
                errorMessage.includes('heap size') || 
                errorMessage.includes('limit') ||
                errorMessage.includes('too large')
            )) {
                // This is a size-related error
                this.showAnomalyBanner = true;
                this.anomalyBannerMessage = 'The document analysis could not be completed due to file size limitations. Some documents may be too large for automatic analysis. Please try analyzing the record without document analysis or with fewer/smaller documents.';
            } else {
                // Generic error
                this.showAnomalyBanner = true;
                this.anomalyBannerMessage = 'Could not perform automatic record analysis. Please proceed with caution or try analyzing manually.';
            }
            
            // Automatically open the accordion when there is an error
            this.activeAccordionSections = ['anomalySection'];
            
            // Show a toast for visibility
            this.showErrorToast('Anomaly Check Error', errorMessage || 'Failed to perform anomaly check');
        } finally {
            // Ensure loading state is turned off
            this.anomalyCheckLoading = false;
            console.log('Anomaly check finished.');
        }
    }

    // Utility to extract error messages with better handling
    getErrorMessage(error) {
        let message = 'Unknown error';
        
        // Check various error structures
        if (error?.body?.message) {
            message = error.body.message;
        } else if (error?.body?.pageErrors?.[0]?.message) {
            message = error.body.pageErrors[0].message;
        } else if (error?.body?.fieldErrors) {
            // Handle field-specific errors
            const fieldErrors = Object.values(error.body.fieldErrors).flat();
            message = fieldErrors.map(e => e.message).join(', ');
        } else if (error?.message) {
            message = error.message;
        } else if (typeof error === 'string') {
            message = error;
        }
        
        // Clean up common error prefixes for better UX
        message = message.replace(/^Error: /, '');
        message = message.replace(/^System.AuraHandledException: /, '');
        
        return message;
    }

    // Wire to get the record data first to determine object API name properly
    @wire(getRecord, { recordId: '$effectiveRecordId', fields: [ID_FIELD] })
    wiredRecord({ error, data }) {
        if (data) {
            // If recordId changes or becomes available, reload PDF attachments
            this.loadPdfAttachments(); 
            
            // Original logic for objectApiName and anomaly check
            if (this.effectiveRecordId) {
                this.objectApiName = this.effectiveRecordId.substring(0, 3);
                console.log('Record ID updated:', this.effectiveRecordId);
                console.log('Object API Name key prefix:', this.objectApiName);
                if (this.llmOptions.length > 0 && this.selectedLLM && this.enableAnomalyDetection && !this.anomalyCheckResult && !this.anomalyCheckLoading) {
                    console.log('Record data loaded, triggering initial anomaly check from wiredRecord.');
                    this.performInitialAnomalyCheck();
                }
            }
        } else if (error) {
            console.error('Error loading record data:', this.getErrorMessage(error));
            // Potentially clear PDF documents if record context is lost/errored
            this.pdfDocuments = [];
            this._firstPdfIdToAnalyze = null;
        }
    }

    // New method to fetch object metadata using Apex
    loadObjectMetadata() {
        if (this.effectiveRecordId) {
            // Show loading state if needed
            
            getObjectMetadataFromId({ recordId: this.effectiveRecordId })
                .then(result => {
                    if (result) {
                        // Store the object API name
                        this.objectApiName = result.objectApiName;
                        
                        // Store field metadata
                        if (this.analysisFieldApiName && result.fields) {
                            const fieldData = result.fields[this.analysisFieldApiName];
                            if (fieldData) {
                                this.fieldLabel = fieldData.label;
                            } else {
                                console.error('Field API name not found in object metadata:', this.analysisFieldApiName);
                            }
                        }
                    }
                })
                .catch(error => {
                    // Handle error silently - don't disrupt user experience for metadata loading
                    console.error('Error loading object metadata from Apex:', this.getErrorMessage(error));
                });
        }
    }

    // New method to prepare synopsis modal that returns a Promise
    prepareSynopsisModal(analysis) {
        // If an analysis field name is configured, offer to save the summary
        if (this.analysisFieldApiName) {
            // Track the full analysis for context
            this.currentAnalysis = analysis;
            
            // Prepare a summary that emphasizes key information and fits within field limits
            this.prepareSynopsisSummary(analysis);
            
            // Use the field label retrieved from getObjectMetadataFromId
            // If not available, default to the field API name
            if (!this.fieldLabel) {
                this.fieldLabel = this.analysisFieldApiName;
            }
            
            // Show the modal for user confirmation
            this.showSaveAnalysisModal = true;
        }
    }

    // Helper method to prepare synopsis summary that returns a Promise
    prepareSynopsisSummary(analysis) {
        return new Promise((resolve) => {
            // Create a summarized version for the field
            // Strict character limit of 500-600 characters (about 90 words)
            const promptForSummary = 
            `Create a professional Synopsis of the following record analysis in a single concise paragraph (STRICT LIMIT: 500-600 characters maximum, about 90 words).
            
            IMPORTANT: The character limit is STRICT and the synopsis MUST be under 600 characters total.
            
            The synopsis should:
            - Begin with "The record" or a more specific descriptor based on the record type
            - Focus only on the most critical information
            - Use extremely concise language with no unnecessary words
            - Be immediately useful for someone reviewing this record
            
            Here is the analysis to summarize:
            
            ${analysis}`;
            
            console.log('Getting full record context...');
            // First get full record context to have the most complete information
            handleRequest({
                recordId: this.effectiveRecordId,
                configName: this.selectedLLM,
                prompt: 'Provide a detailed analysis of this record including all important fields and relationships.',
                operation: 'summarize',
                relatedObjects: this.relatedObjects,
                reportObjects: this.reportObjects || ''
            })
            .then(recordContext => {
                console.log('Record context received, generating summary...');
                // Now generate the summary with both the original analysis and record context
                const enhancedPrompt = 
                `${promptForSummary}
                
                Additionally, here is the complete record information to ensure accuracy:
                
                ${recordContext}
                
                FINAL REMINDER: The output MUST be under 600 characters total.`;
                
                return handleRequest({
                    recordId: this.effectiveRecordId,
                    configName: this.selectedLLM,
                    prompt: enhancedPrompt,
                    operation: 'ask',
                    relatedObjects: '',
                    reportObjects: ''
                });
            })
            .then(summary => {
                console.log('Summary generated, length:', summary.length, 'characters');
                // Enforce the character limit
                if (summary.length > 600) {
                    this.analysisSummary = summary.substring(0, 597) + '...';
                    console.log('Summary truncated to 600 characters');
                } else {
                    this.analysisSummary = summary;
                }
                // Set character count for display
                this.analysisSummaryCharCount = this.analysisSummary.length;
                console.log('Showing save modal with character count:', this.analysisSummaryCharCount);
                this.showSaveAnalysisModal = true;
                resolve();
            })
            .catch(error => {
                console.error('Error generating summary:', error);
                // If summary generation fails, use a simplified approach
                handleRequest({
                    recordId: this.effectiveRecordId,
                    configName: this.selectedLLM,
                    prompt: `${promptForSummary} REMEMBER: Output MUST be 600 characters or less.`,
                    operation: 'ask',
                    relatedObjects: '',
                    reportObjects: ''
                })
                .then(fallbackSummary => {
                    console.log('Fallback summary generated, length:', fallbackSummary.length);
                    // Enforce the character limit on fallback too
                    if (fallbackSummary.length > 600) {
                        this.analysisSummary = fallbackSummary.substring(0, 597) + '...';
                    } else {
                        this.analysisSummary = fallbackSummary;
                    }
                    // Set character count for display
                    this.analysisSummaryCharCount = this.analysisSummary.length;
                    console.log('Showing save modal with fallback summary');
                    this.showSaveAnalysisModal = true;
                    resolve();
                })
                .catch(fallbackError => {
                    console.error('Fallback summary generation failed:', fallbackError);
                    // If all else fails, use a truncated version of the analysis
                    const truncatedAnalysis = analysis.substring(0, 597);
                    this.analysisSummary = truncatedAnalysis + (analysis.length > 597 ? '...' : '');
                    this.analysisSummaryCharCount = this.analysisSummary.length;
                    console.log('Using truncated analysis as last resort');
                    this.showSaveAnalysisModal = true;
                    resolve();
                });
            });
        });
    }

    // Handle modal confirmation to save analysis to field
    handleSaveAnalysisConfirm() {
        console.log('Saving analysis to field:', this.analysisFieldApiName);
        console.log('Field label for toast:', this.fieldLabel);
        
        // Ensure we have a field label, use API name as fallback
        if (!this.fieldLabel) {
            this.fieldLabel = this.analysisFieldApiName;
            console.log('Using API name as field label fallback:', this.fieldLabel);
        }
        
        this.showSaveAnalysisModal = false;
        
        // Show spinner while saving
        this.isLoading = true;
        
        saveAnalysisToField({
            recordId: this.effectiveRecordId,
            fieldApiName: this.analysisFieldApiName,
            analysisText: this.analysisSummary
        })
        .then(() => {
            console.log('Analysis saved successfully');
            
            // Refresh the record data
            getRecordNotifyChange([{recordId: this.effectiveRecordId}]);
            
            // Show success toast with field label or API name
            const fieldDisplayName = this.fieldLabel || this.analysisFieldApiName || 'specified';
            
            this.dispatchEvent(new ShowToastEvent({
                title: 'Success',
                message: `Analysis saved to ${fieldDisplayName} field`,
                variant: 'success'
            }));
            
            // Update if we're in a record form context
            const recordEditForm = this.template.querySelector('lightning-record-edit-form');
            if (recordEditForm) {
                recordEditForm.submit();
            }
        })
        .catch(error => {
            console.error('Error saving analysis:', error);
            this.showError(`Error saving analysis to field: ${this.getErrorMessage(error)}`);
        })
        .finally(() => {
            this.isLoading = false;
        });
    }
    
    // Handle modal cancellation
    handleSaveAnalysisCancel() {
        this.showSaveAnalysisModal = false;
    }

    // Get class for character count based on length
    get characterCountClass() {
        if (this.analysisSummaryCharCount > 580) {
            return 'character-count-error';
        } else if (this.analysisSummaryCharCount > 500) {
            return 'character-count-warning';
        }
        return '';
    }

    // Get recordId from PageReference if available
    getRecordIdFromPageRef() {
        if (this.pageRef && this.pageRef.attributes) {
            return this.pageRef.attributes.recordId || null;
        }
        return null;
    }

    // Get recordId from URL if present
    getRecordIdFromUrl() {
        const url = window.location.href;
        const idPattern = /\/([a-zA-Z0-9]{15,18})(?:\/|\?|$)/;
        const match = url.match(idPattern);
        return match ? match[1] : null;
    }
    
    // Get the effective record ID from all possible sources
    get effectiveRecordId() {
        const recordId = this.recordId || this.getRecordIdFromPageRef() || this.getRecordIdFromUrl();
        
        if (recordId && recordId !== this._lastRecordId) {
            this._lastRecordId = recordId;
            console.log('Record ID updated:', recordId);
            
            // Re-load object metadata if record ID changes
            this.loadObjectMetadata();
            
            // Load PDF attachments if enabled
            if (this.enableDocumentAnalysis) {
                this.loadPdfAttachments();
            }
            
            // If in Flow context and we've received a record ID, perform any necessary setup
            if (this.conversationOutput !== undefined) {
                console.log('In Flow context with recordId:', recordId);
            }
        }
        return recordId;
    }

    // Check if message ID already exists
    generateMessageId() {
        return 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    }

    // --- New Methods for PDF Analysis ---
    async loadPdfAttachments() {
        if (!this.effectiveRecordId) {
            this.pdfDocuments = []; // Clear if no recordId
            this._firstPdfIdToAnalyze = null;
            return;
        }

        this.pdfProcessingError = null; // Clear previous errors
        try {
            console.log('Loading PDF attachments for record:', this.effectiveRecordId);
            const result = await getPdfAttachmentsForRecord({ recordId: this.effectiveRecordId });
            this.pdfDocuments = result || [];
            this._firstPdfIdToAnalyze = (this.pdfDocuments.length > 0) ? this.pdfDocuments[0].id : null;
            console.log('PDF attachments loaded: ', this.pdfDocuments.length);
            if (this.pdfDocuments.length > 0) {
                console.log('First PDF to analyze: ', this.pdfDocuments[0].title, 'ID:', this._firstPdfIdToAnalyze);
            }
        } catch (error) {
            this.pdfProcessingError = 'Error loading PDF attachments: ' + this.getErrorMessage(error);
            this.pdfDocuments = [];
            this._firstPdfIdToAnalyze = null;
            console.error('Error loading PDF attachments:', error);
            this.showErrorToast('Failed to load PDF attachments.', this.pdfProcessingError, 'error');
        }
    }

    async handleAnalyzeDocumentClick() {
        if (!this.hasPdfDocuments || this.isProcessingPdf) {
            return;
        }

        // If there's only one document, analyze it directly
        if (this.pdfDocuments.length === 1) {
            this.selectedDocumentIds = [this.pdfDocuments[0].id];
            this.performDocumentAnalysis();
        } else {
            // Show document selection modal for multiple documents
            this.selectedDocumentIds = []; // Reset selection
            this.showDocumentSelectionModal = true;
        }
    }

    // Handle document selection change
    handleDocumentSelectionChange(event) {
        const documentId = event.target.value;
        const isChecked = event.target.checked;
        
        if (isChecked) {
            this.selectedDocumentIds = [...this.selectedDocumentIds, documentId];
        } else {
            this.selectedDocumentIds = this.selectedDocumentIds.filter(id => id !== documentId);
        }
    }

    // Handle select all documents
    handleSelectAllDocuments(event) {
        const isChecked = event.target.checked;
        
        if (isChecked) {
            this.selectedDocumentIds = this.pdfDocuments.map(doc => doc.id);
        } else {
            this.selectedDocumentIds = [];
        }
        
        // Update all checkboxes
        const checkboxes = this.template.querySelectorAll('input[type="checkbox"][data-document-id]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
        });
    }

    // Handle document selection modal cancel
    handleDocumentSelectionCancel() {
        this.showDocumentSelectionModal = false;
        this.selectedDocumentIds = [];
    }

    // Handle document selection modal confirm
    handleDocumentSelectionConfirm() {
        if (this.selectedDocumentIds.length === 0) {
            this.showError('Please select at least one document to analyze');
            return;
        }
        
        this.showDocumentSelectionModal = false;
        this.performDocumentAnalysis();
    }

    // Perform the actual document analysis
    async performDocumentAnalysis() {
        this.isProcessingPdf = true;
        this.pdfProcessingError = null;
        this.response = null; // Clear current response
        const userPrompt = this.userPrompt;
        
        try {
            const MAX_DOCUMENTS = 3; // Maximum number of documents to send
            let docIdsToProcess = this.selectedDocumentIds;
            
            // If we have more than MAX_DOCUMENTS, warn the user and only process the first MAX_DOCUMENTS
            if (docIdsToProcess.length > MAX_DOCUMENTS) {
                const warningMessage = `Note: Only analyzing the first ${MAX_DOCUMENTS} selected PDF documents due to size limitations.`;
                this.showErrorToast('Document Limit', warningMessage, 'warning');
                docIdsToProcess = docIdsToProcess.slice(0, MAX_DOCUMENTS);
                console.log(`Limiting PDF analysis to ${MAX_DOCUMENTS} documents out of ${this.selectedDocumentIds.length} selected`);
            }
            
            console.log('Calling processPdfDocumentWithAI for record: ' + this.effectiveRecordId + 
                       ', docIds: ' + docIdsToProcess.join(', '));
                       
            const result = await processPdfDocumentWithAI({
                recordId: this.effectiveRecordId,
                contentDocumentIds: docIdsToProcess,
                userPrompt: userPrompt || 'Analyze this document in detail and provide a comprehensive analysis.'
            });
            
            this.response = result;
            
            // If field analysis is enabled and we have target fields to extract, show the extraction modal
            if (this.documentAnalysisFieldsApiNames && this.documentAnalysisFieldsApiNames.trim() !== '') {
                this.handleDataExtraction([result]);
            }
            
        } catch (error) {
            console.error('Error during PDF analysis call:', error);
            const errorMessage = this.getErrorMessage(error);
            
            // Check for heap size specific errors
            if (errorMessage && (
                errorMessage.includes('size limits') || 
                errorMessage.includes('heap size') || 
                errorMessage.includes('limit')
            )) {
                this.pdfProcessingError = 'The PDF documents exceed Salesforce size limits. Try analyzing fewer or smaller documents.';
            } else {
                this.pdfProcessingError = 'Error analyzing PDF document: ' + errorMessage;
            }
            
            this.showErrorToast('PDF Analysis Error', this.pdfProcessingError);
        } finally {
            this.isProcessingPdf = false;
        }
    }

    // Getters for toggle button
    get toggleIconName() {
        return this.showConversationHistory ? 'utility:chevronup' : 'utility:chevrondown';
    }
    
    get toggleAlternativeText() {
        return this.showConversationHistory ? 'Hide conversation' : 'Show conversation';
    }
    
    get toggleTitle() {
        return this.showConversationHistory ? 'Hide conversation' : 'Show conversation';
    }

    // Getters for PDF Analysis
    get hasPdfDocuments() {
        return this.pdfDocuments && this.pdfDocuments.length > 0;
    }

    get hasMultiplePdfDocuments() {
        return this.pdfDocuments && this.pdfDocuments.length > 1;
    }

    get showAnalyzeDocumentButton() {
        return this.enableDocumentAnalysis && this.hasPdfDocuments && !this.isProcessingPdf;
    }
    
    // Add a new computed property to check if actions should be disabled
    get areActionsDisabled() {
        return this.anomalyCheckLoading || this.isLoading || this.isProcessingPdf;
    }

    get areReportActionsDisabled() {
        return this.anomalyCheckLoading || this.isLoading || this.isProcessingPdf || this.isGeneratingReport;
    }

    get isLoadingOrGeneratingReport() {
        return this.isLoading || this.isGeneratingReport;
    }
    
    get analyzeDocumentButtonLabel() {
        return this.pdfDocuments.length === 1 ? 
               'Analyze PDF Document' : 
               'Select & Analyze Documents';
    }

    // New getter for Analyze Images button label
    get analyzeImagesButtonLabel() {
        return 'Analyze Attached Images';
    }

    // --- Chart-related getters ---
    get showGenerateReportButton() {
        return this.reportObjects && this.reportObjects.trim() !== '';
    }

    get chartTypeOptions() {
        return [
            { label: 'Bar Chart', value: 'bar' },
            { label: 'Pie Chart', value: 'pie' },
            { label: 'Line Chart', value: 'line' },
            { label: 'Data Table', value: 'table' }
        ];
    }

    get isBarChart() {
        return this.reportChartType === 'bar';
    }

    get isPieChart() {
        return this.reportChartType === 'pie';
    }

    get isLineChart() {
        return this.reportChartType === 'line';
    }

    get isDataTable() {
        return this.reportChartType === 'table';
    }

    get reportSummary() {
        if (!this.reportData || !this.reportData.totalRecords) {
            return '';
        }
        return `${this.reportData.totalRecords} total records`;
    }

    get chartContainerClass() {
        return `chart-container chart-${this.reportChartType}`;
    }

    showErrorToast(title, message, variant = 'error') {
        this.dispatchEvent(
            new ShowToastEvent({
                title: title,
                message: message,
                variant: variant,
                mode: 'sticky' // Keep error messages until dismissed
            })
        );
    }

    // --- Handlers for Document Field Extraction Modal ---
    handleExtractFieldsCancel() {
        this.showExtractFieldsModal = false;
        this.extractedFieldsData = []; // Clear data
    }

    handleExtractFieldChange(event) {
        const fieldApiName = event.target.name;
        const selectedValue = event.detail.value;

        this.extractedFieldsData = this.extractedFieldsData.map(field => {
            if (field.apiName === fieldApiName) {
                return { ...field, selectedValue: selectedValue };
            }
            return field;
        });
    }

    async handleExtractFieldsConfirm() {
        this.isExtractingFields = true; // Reuse for loading state during save
        const fieldsToUpdate = {};
        let hasChanges = false;

        this.extractedFieldsData.forEach(field => {
            // Check if a new value is selected and it's different from the current value 
            // or if the current value was null/undefined and a new value (not __KEEP_CURRENT__) is chosen.
            // The value '__KEEP_CURRENT__' is used if the current value itself was null/undefined and the user selected to keep it.
            if (field.selectedValue !== '__KEEP_CURRENT__' && field.selectedValue !== field.currentValue) {
                fieldsToUpdate[field.apiName] = field.selectedValue;
                hasChanges = true;
            } else if (field.selectedValue !== '__KEEP_CURRENT__' && (field.currentValue === null || field.currentValue === undefined)){
                // This covers cases where current value was empty and a new actual value is selected
                fieldsToUpdate[field.apiName] = field.selectedValue;
                hasChanges = true;
            }
            // If selectedValue is the actual current value (not the __KEEP_CURRENT__ marker for an empty field), 
            // and it's different from what was originally there, it means user selected the current value from suggestions explicitly.
            // This logic is mostly handled by the first condition. The key is that '__KEEP_CURRENT__' should not be sent to Apex.
        });

        if (!hasChanges) {
            this.showErrorToast('No Changes', 'No new values were selected to update the record.', 'info');
            this.isExtractingFields = false;
            this.showExtractFieldsModal = false;
            this.extractedFieldsData = [];
            return;
        }

        try {
            await updateRecordFields({ recordId: this.effectiveRecordId, fieldsToUpdate: fieldsToUpdate });
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Success',
                    message: 'Record fields updated successfully from document data.',
                    variant: 'success'
                })
            );
            getRecordNotifyChange([{ recordId: this.effectiveRecordId }]); // Refresh record view
        } catch (error) {
            this.showErrorToast('Update Failed', `Error updating record fields: ${this.getErrorMessage(error)}`, 'error');
        } finally {
            this.isExtractingFields = false;
            this.showExtractFieldsModal = false;
            this.extractedFieldsData = [];
        }
    }
    // --- End Handlers for Document Field Extraction Modal ---

    // Helper method to handle data extraction from document analysis results
    handleDataExtraction(documentAnalysisResults) {
        if (!this.documentAnalysisFieldsApiNames || !documentAnalysisResults || documentAnalysisResults.length === 0) {
            return;
        }
        
        this.isExtractingFields = true;
        const fieldApiNames = this.documentAnalysisFieldsApiNames.split(',')
            .map(name => name.trim())
            .filter(name => name);
            
        console.log('Extracting data for fields:', fieldApiNames.join(', '));
        
        // Call the Apex method to extract fields from the document analysis results
        extractFieldsFromDocuments({
            recordId: this.effectiveRecordId,
            analyzedDocumentContents: documentAnalysisResults,
            targetFieldApiNames: fieldApiNames,
            llmConfigName: 'OpenAI_GPT4_Vision' // Use the powerful model for extraction
        })
        .then(extractionData => {
            console.log('Field extraction data received:', JSON.stringify(extractionData, null, 2));
            if (extractionData && extractionData.fields) {
                // Transform data for the modal
                this.extractedFieldsData = Object.values(extractionData.fields).map(field => ({
                    ...field,
                    id: field.apiName, 
                    options: [
                        { 
                            label: `Current: ${field.currentValue === null || field.currentValue === undefined ? '(empty)' : field.currentValue}`, 
                            value: field.currentValue === null || field.currentValue === undefined ? '__KEEP_CURRENT__' : field.currentValue 
                        }, 
                        ...(field.suggestedValues || []).map(sugg => ({ label: sugg, value: sugg }))
                    ],
                    selectedValue: field.currentValue === null || field.currentValue === undefined ? '__KEEP_CURRENT__' : field.currentValue 
                }));
                
                // Only show the modal if we have fields with suggestions
                if (this.extractedFieldsData.some(field => field.options.length > 1)) {
                    this.showExtractFieldsModal = true;
                } else {
                    this.showErrorToast('No Field Data Found', 'No relevant field data could be extracted from the documents.', 'info');
                }
            } else {
                this.showErrorToast('Field Extraction Failed', 'Could not retrieve structured field data from documents.', 'error');
            }
        })
        .catch(error => {
            console.error('Error extracting fields:', error);
            this.showErrorToast('Field Extraction Error', 'Error during field extraction: ' + this.getErrorMessage(error), 'error');
        })
        .finally(() => {
            this.isExtractingFields = false;
        });
    }

    // --- Chart/Report Event Handlers ---
    handleGenerateReport() {
        if (!this.reportObjects || this.reportObjects.trim() === '') {
            this.showErrorToast('Configuration Error', 'No report objects configured. Please set the reportObjects property.', 'error');
            return;
        }

        this.isGeneratingReport = true;
        this.reportError = '';

        // Check if user has entered a specific question
        const userQuestion = this.userPrompt && this.userPrompt.trim() !== '' ? this.userPrompt.trim() : '';
        
        // Generate report prompt based on user input or default analysis
        let reportPrompt;
        if (userQuestion) {
            // User has a specific question - use it for targeted analysis
            reportPrompt = `Based on the user's question: "${userQuestion}"

Analyze data from these Salesforce objects: ${this.reportObjects}

Please provide:
1. Direct answer to the user's question with specific data counts/metrics
2. Structured data breakdown suitable for charts
3. Additional insights related to the question

For chart visualization, format your response to include:
- Clear categories and their values
- Specific counts or percentages
- Data that can be visualized in bar charts, pie charts, or tables

Examples of good responses:
- "Cases by Status: Open (25), Closed (45), In Progress (12)"
- "Accounts by Type: Customer (80), Partner (30), Prospect (50)"
- "Opportunities by Stage: Qualification (15), Proposal (8), Closed Won (22)"

Question: ${userQuestion}`;
        } else {
            // No specific question - generate general analysis
            reportPrompt = `Generate a comprehensive data analysis report from the configured objects: ${this.reportObjects}. 

Please analyze the data and provide:
1. Key metrics and counts
2. Data trends and patterns  
3. Distribution analysis
4. Structured data suitable for charts

Format the response with clear data breakdowns like:
- Record counts by type/status/category
- Distribution percentages
- Key performance indicators

Make the data suitable for visualization in charts.`;
        }

        const requestParams = {
            configName: this.selectedLLM,
            prompt: reportPrompt,
            operation: 'report',
            recordId: this.effectiveRecordId || '',
            relatedObjects: '',
            reportObjects: this.reportObjects,
            userPrompt: userQuestion // Pass the original question
        };

        handleRequest(requestParams)
            .then(result => {
                console.log('Report generated successfully:', result);
                
                // Parse the result and create chart data based on the response
                this.reportData = this.createChartDataFromResponse(result, userQuestion);
                this.showReportModal = true;
                
                // Clear the user prompt after generating report
                if (userQuestion) {
                    this.userPrompt = '';
                }
                
                // Render the initial chart after modal opens
                setTimeout(() => {
                    this.renderCurrentChart();
                }, 100);
            })
            .catch(error => {
                console.error('Error generating report:', error);
                this.reportError = this.getErrorMessage(error);
                this.showErrorToast('Report Generation Failed', this.reportError, 'error');
            })
            .finally(() => {
                this.isGeneratingReport = false;
            });
    }

    handleChartTypeChange(event) {
        this.reportChartType = event.detail.value;
        
        // Re-render chart with new type
        setTimeout(() => {
            this.renderCurrentChart();
        }, 100);
    }

    handleReportModalClose() {
        this.showReportModal = false;
        this.reportData = null;
        
        // Clean up chart instance
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
    }

    // Create chart data from AI response by parsing text patterns
    createChartDataFromResponse(aiResponse, userQuestion = '') {
        try {
            // Define color palette for charts
            const colors = [
                '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
                '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
            ];

            // Try to extract structured data from AI response
            const extractedData = this.parseAIResponseForData(aiResponse);
            
            if (extractedData.length > 0) {
                // Use parsed data
                const totalRecords = extractedData.reduce((sum, item) => sum + item.value, 0);
                
                // Add colors to the data
                const records = extractedData.map((item, index) => ({
                    ...item,
                    color: colors[index % colors.length]
                }));

                return {
                    totalRecords: totalRecords,
                    records: records,
                    chartData: {
                        labels: records.map(r => r.label),
                        datasets: [{
                            data: records.map(r => r.value),
                            backgroundColor: records.map(r => r.color),
                            borderColor: records.map(r => r.color),
                            borderWidth: 1
                        }]
                    },
                    rawResponse: aiResponse,
                    query: userQuestion
                };
            } else {
                // Return empty data if parsing fails
                console.log('Could not parse specific data from AI response, showing no data');
                return {
                    totalRecords: 0,
                    records: [],
                    chartData: {
                        labels: [],
                        datasets: [{
                            data: [],
                            backgroundColor: [],
                            borderColor: [],
                            borderWidth: 1
                        }]
                    },
                    rawResponse: aiResponse,
                    query: userQuestion
                };
            }
        } catch (error) {
            console.error('Error parsing AI response for chart data:', error);
            return {
                totalRecords: 0,
                records: [],
                chartData: {
                    labels: [],
                    datasets: [{
                        data: [],
                        backgroundColor: [],
                        borderColor: [],
                        borderWidth: 1
                    }]
                },
                rawResponse: aiResponse,
                query: userQuestion || 'Unknown'
            };
        }
    }

    // Parse AI response to extract data patterns - STRICT mode for clean chart data
    parseAIResponseForData(response) {
        const data = [];
        
        // Enhanced pattern to match both status labels and date/month labels
        // Matches: "New: 78", "Jul 2025: 54", "On Hold: 5", "Jan 2024: 23"
        const strictPattern = /^[\s\-•*]*([A-Za-z][A-Za-z\s\d]{0,25}):\s*(\d+)[\s]*$/gm;
        let match;
        
        while ((match = strictPattern.exec(response)) !== null) {
            const label = match[1].trim();
            const value = parseInt(match[2]);
            
            if (!isNaN(value) && value > 0) {
                // Only accept short, field-like labels (not sentences)
                if (label.length <= 30 && !this.isNarrativeText(label)) {
                    // Avoid duplicates
                    if (!data.find(item => item.label.toLowerCase() === label.toLowerCase())) {
                        data.push({ label: label, value: value });
                    }
                }
            }
        }

        return data.slice(0, 10); // Limit to 10 items for better visualization
    }

    // Helper method to identify narrative text vs actual field values
    isNarrativeText(text) {
        const narrativeWords = [
            'here is', 'here are', 'the analysis', 'analysis of', 'total cases', 
            'cases created', 'based on', 'shows that', 'indicates that',
            'over', 'only', 'since', 'about', 'approximately', 'breakdown',
            'summary', 'report', 'data shows', 'results show', 'findings'
        ];
        
        const lowerText = text.toLowerCase();
        return narrativeWords.some(phrase => lowerText.includes(phrase));
    }



    // Chart rendering methods
    renderCurrentChart() {
        if (!this.reportData || this.reportChartType === 'table') {
            return;
        }

        const canvas = this.template.querySelector('.chart-canvas');
        if (!canvas) {
            console.error('Chart canvas not found');
            return;
        }

        // Clean up existing chart
        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        const ctx = canvas.getContext('2d');
        
        let chartConfig = {
            type: this.reportChartType,
            data: this.reportData.chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        };

        // Customize based on chart type
        if (this.reportChartType === 'pie') {
            chartConfig.options.plugins.legend.position = 'right';
        } else if (this.reportChartType === 'line') {
            chartConfig.options.scales = {
                y: {
                    beginAtZero: true
                }
            };
        }

        try {
            this.chartInstance = new Chart(ctx, chartConfig);
        } catch (error) {
            console.error('Error creating chart:', error);
            this.showErrorToast('Chart Error', 'Failed to render chart: ' + error.message, 'error');
        }
    }
}