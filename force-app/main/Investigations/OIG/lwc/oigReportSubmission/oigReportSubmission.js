import { LightningElement, track, wire, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import submitOIGReport from '@salesforce/apex/OIGReportSubmissionController.submitOIGReport';
import getCategoryOptions from '@salesforce/apex/OIGReportSubmissionController.getCategoryOptions';
import getSeverityOptions from '@salesforce/apex/OIGReportSubmissionController.getSeverityOptions';
import getSubmissionsByAnonymousId from '@salesforce/apex/OIGReportSubmissionController.getSubmissionsByAnonymousId';
import getSubmissionsByContact from '@salesforce/apex/OIGReportSubmissionController.getSubmissionsByContact';

export default class OigReportSubmission extends LightningElement {
    
    // Configuration Properties
    @api formWidth = '100%';
    @api formMaxWidth = '900px';
    @api headerTitle = 'Report Fraud, Waste & Abuse';
    @api headerSubtitle = 'Office of Inspector General (OIG) - Confidential Reporting Portal';
    @api headerIcon = 'utility:shield';
    @api securityNotice = 'Your submission is secure and may be submitted anonymously';
    @api headerBgColor = '#1e3a8a';
    @api headerGradientEnd = '#2563eb';
    @api sectionTitleColor = '#1e40af';
    @api sectionTitleBorder = '#3b82f6';
    @api buttonColor = '#1e40af';
    @api buttonColorHover = '#1e3a8a';
    
    // Combined Sections and Fields Configuration
    @api sectionsAndFields = 'Reporting Method - anonymousOption:radio:How would you like to submit this report?:isAnonymous:true:100%:Provide my contact information|false,Submit anonymously|true, Contact Information - reporterName:text:Full Name:reporterName:true:50%;reporterEmail:email:Email Address (Optional for anonymous):reporterEmail:false:50%;reporterPhone:tel:Phone Number (Optional):reporterPhone:false:50%;consentToContact:checkbox:I consent to be contacted about this report:consentToContact:false:100%;preferredContactMethod:radio:Preferred Contact Method:preferredContactMethod:false:100%:Email|Email,Phone|Phone,Do Not Contact|Do Not Contact, Report Details - category:combobox:Category:category:true:50%:categoryOptions;severity:combobox:Severity:severity:true:50%:severityOptions;reportDetails:textarea:Detailed Description:reportDetails:true:100%:6, Incident Information - incidentLocation:text:Incident Location (Optional):incidentLocation:false:50%;incidentDate:date:Incident Date (Optional):incidentDate:false:50%;witnessInfo:textarea:Witness Information (Optional):witnessInfo:false:100%:3';
    
    // Legacy Configuration Properties
    @api sectionTitles = '';
    @api sectionIcons = 'utility:identity, utility:contact, utility:record, utility:location, utility:info';
    @api privacyFields = 'anonymousOption:radio:How would you like to submit this report?:isAnonymous:true:100%:Provide my contact information|false,Submit anonymously|true';
    @api contactFields = 'reporterName:text:Full Name:reporterName:true:50%,reporterEmail:email:Email Address (Optional for anonymous):reporterEmail:false:50%,reporterPhone:tel:Phone Number (Optional):reporterPhone:false:50%,consentToContact:checkbox:I consent to be contacted about this report:consentToContact:false:100%,preferredContactMethod:radio:Preferred Contact Method:preferredContactMethod:false:100%:Email|Email,Phone|Phone,Do Not Contact|Do Not Contact';
    @api reportDetailsFields = 'category:combobox:Category:category:true:50%:categoryOptions,severity:combobox:Severity:severity:true:50%:severityOptions,reportDetails:textarea:Detailed Description:reportDetails:true:100%:6';
    @api incidentFields = 'incidentLocation:text:Incident Location (Optional):incidentLocation:false:50%,incidentDate:date:Incident Date (Optional):incidentDate:false:50%,witnessInfo:textarea:Witness Information (Optional):witnessInfo:false:100%:3';
    @api noticeContent = 'Whistleblower Protection|Federal law prohibits retaliation against employees who report fraud, waste, or abuse. You are protected under the Whistleblower Protection Act.,False Claims|Knowingly submitting false information is prohibited and may subject you to criminal prosecution under federal law.,Follow-up Process|Your report will be reviewed and investigated as appropriate. You will receive updates on the status if you provided contact information.';
    
    // Conditional Visibility Rules
    @api contactSectionVisible = '!formData.isAnonymous'; // Hide entire contact section when anonymous
    @api preferredContactVisible = 'formData.consentToContact && !formData.isAnonymous';
    @api reporterNameVisible = '!formData.isAnonymous';
    @api reporterPhoneVisible = '!formData.isAnonymous';
    @api consentToContactVisible = '!formData.isAnonymous';

    // Form data - Dynamic based on field configuration
    @track formData = {
        reporterName: '',
        reporterEmail: '',
        reporterPhone: '',
        category: '',
        severity: 'Medium',
        reportDetails: '',
        incidentLocation: '',
        incidentDate: '',
        witnessInfo: '',
        submissionSource: 'Web Portal',
        isAnonymous: false,
        preferredContactMethod: 'Email',
        consentToContact: true
    };

    // Component state
    @track isLoading = false;
    @track isSubmitted = false;
    @track error = null;
    @track submissionResult = null;
    @track currentMode = 'submit'; // 'submit' or 'view'
    @track viewSubmissionsData = {
        anonymousId: '',
        fullName: '',
        email: '',
        isAnonymousLookup: false
    };
    @track existingSubmissions = [];
    @track isLoadingSubmissions = false;
    
    // Options data
    @track categoryOptions = [];
    @track severityOptions = [];
    @track parsedSections = [];
    @track parsedNotices = [];

    // Wire methods to get picklist options
    @wire(getCategoryOptions)
    wiredCategoryOptions({ error, data }) {
        console.log('wiredCategoryOptions called - data:', data, 'error:', error);
        if (data) {
            console.log('Category options:', JSON.stringify(data));
            this.categoryOptions = data;
            // Re-process sections when options are loaded
            this.parseConfigurations();
        } else if (error) {
            console.error('Error loading category options:', error);
        }
    }

    @wire(getSeverityOptions)
    wiredSeverityOptions({ error, data }) {
        console.log('wiredSeverityOptions called - data:', data, 'error:', error);
        if (data) {
            console.log('Severity options:', JSON.stringify(data));
            this.severityOptions = data;
            // Re-process sections when options are loaded
            this.parseConfigurations();
        } else if (error) {
            console.error('Error loading severity options:', error);
        }
    }

    // Lifecycle methods
    connectedCallback() {
        console.log('OIG Report Submission component connected');
        console.log('Initial categoryOptions:', this.categoryOptions);
        console.log('Initial severityOptions:', this.severityOptions);
        this.parseConfigurations();
        this.initializeFormData();
    }

    // Configuration parsing methods
    parseConfigurations() {
        console.log('parseConfigurations called');
        try {
            this.parsedSections = this.parseSections();
            this.parsedNotices = this.parseNotices();
            console.log('Parsed sections:', this.parsedSections);
        } catch (error) {
            console.error('Error parsing configurations:', error);
            this.parsedSections = [];
            this.parsedNotices = [];
        }
    }

    // Get configuration value from @api properties
    getConfigValue(property, defaultValue) {
        return this[property] || defaultValue;
    }

    parseSections() {
        // Use new combined format if provided, otherwise fall back to legacy
        if (this.sectionsAndFields && this.sectionsAndFields.trim()) {
            return this.parseSectionsAndFields();
        } else {
            return this.parseLegacySections();
        }
    }
    
    parseSectionsAndFields() {
        console.log('Using sectionsAndFields configuration:', this.sectionsAndFields);
        const sections = [];
        const icons = this.getConfigValue('sectionIcons', this.sectionIcons).split(',').map(i => i.trim());
        
        // Parse format: "SectionTitle - field1;field2, SectionTitle2 - field3;field4;field5"
        const sectionMatches = this.sectionsAndFields.split(', ');
        
        sectionMatches.forEach((sectionString, index) => {
            // Extract section title and fields using dash separator
            const dashIndex = sectionString.indexOf(' - ');
            if (dashIndex !== -1) {
                const title = sectionString.substring(0, dashIndex).trim();
                const fieldsString = sectionString.substring(dashIndex + 3).trim();
                const fields = this.parseFieldsSemicolon(fieldsString);
                
                sections.push({
                    id: `section${index}`,
                    title: title,
                    icon: icons[index] || 'utility:record',
                    visible: true,
                    order: index + 1,
                    fields: fields.map(field => this.processFieldForTemplate(field)),
                    isNoticesSection: false
                });
            }
        });
        
        // Add notices section if we have notice content
        if (this.noticeContent) {
            sections.push({
                id: 'notices',
                title: 'Important Information',
                icon: 'utility:info',
                visible: true,
                order: sections.length + 1,
                fields: [],
                isNoticesSection: true
            });
        }
        
        return sections;
    }
    
    parseLegacySections() {
        const titles = this.getConfigValue('sectionTitles', this.sectionTitles).split(',').map(t => t.trim());
        const icons = this.getConfigValue('sectionIcons', this.sectionIcons).split(',').map(i => i.trim());
        const fieldSections = [
            { id: 'privacy', fields: this.parseFields(this.getConfigValue('privacyFields', this.privacyFields)) },
            { id: 'contact', fields: this.parseFields(this.getConfigValue('contactFields', this.contactFields)) },
            { id: 'reportDetails', fields: this.parseFields(this.getConfigValue('reportDetailsFields', this.reportDetailsFields)) },
            { id: 'incident', fields: this.parseFields(this.getConfigValue('incidentFields', this.incidentFields)) },
            { id: 'notices', fields: [] }
        ];

        return titles.map((title, index) => {
            const sectionData = fieldSections[index] || { id: `section${index}`, fields: [] };
            return {
                id: sectionData.id,
                title: title,
                icon: icons[index] || 'utility:record',
                visible: true,
                order: index + 1,
                fields: sectionData.fields.map(field => this.processFieldForTemplate(field)),
                isNoticesSection: sectionData.id === 'notices'
            };
        });
    }

    parseFields(fieldString) {
        if (!fieldString) return [];
        
        return fieldString.split(',').map((fieldDef, index) => {
            const parts = fieldDef.trim().split(':');
            if (parts.length < 6) return null;

            const field = {
                id: parts[0],
                type: parts[1],
                label: parts[2],
                fieldName: parts[3],
                required: parts[4] === 'true',
                width: parts[5],
                order: index + 1
            };

            // Parse additional options for radio/combobox fields
            if (parts[6]) {
                if (parts[1] === 'radio' || parts[1] === 'combobox') {
                    if (parts[6] === 'categoryOptions' || parts[6] === 'severityOptions') {
                        field.optionsSource = parts[6];
                    } else if (parts[6].includes('|')) {
                        field.options = parts[6].split(',').map(opt => {
                            const [label, value] = opt.split('|');
                            return { label: label.trim(), value: value === 'true' ? true : value === 'false' ? false : value.trim() };
                        });
                    }
                } else if (parts[1] === 'textarea') {
                    field.rows = parseInt(parts[6], 10);
                }
            }

            return field;
        }).filter(field => field !== null);
    }

    parseFieldsSemicolon(fieldString) {
        if (!fieldString) return [];
        
        return fieldString.split(';').map((fieldDef, index) => {
            const parts = fieldDef.trim().split(':');
            console.log('Parsing field:', fieldDef, 'Parts:', parts);
            if (parts.length < 6) return null;

            const field = {
                id: parts[0],
                type: parts[1],
                label: parts[2],
                fieldName: parts[3],
                required: parts[4] === 'true',
                width: parts[5],
                order: index + 1
            };

            // Parse additional options for radio/combobox fields
            if (parts[6]) {
                console.log('Processing parts[6]:', parts[6], 'for field type:', parts[1]);
                if (parts[1] === 'radio' || parts[1] === 'combobox') {
                    if (parts[6] === 'categoryOptions' || parts[6] === 'severityOptions') {
                        field.optionsSource = parts[6];
                        console.log('Set optionsSource to:', parts[6]);
                    } else if (parts[6].includes('|')) {
                        field.options = parts[6].split(',').map(opt => {
                            const [label, value] = opt.split('|');
                            return { label: label.trim(), value: value === 'true' ? true : value === 'false' ? false : value.trim() };
                        });
                    }
                } else if (parts[1] === 'textarea') {
                    field.rows = parseInt(parts[6], 10);
                }
            }

            return field;
        }).filter(field => field !== null);
    }

    parseNotices() {
        if (!this.noticeContent) return [];
        
        return this.noticeContent.split(',').map(notice => {
            const [title, content] = notice.split('|');
            return {
                title: title ? title.trim() : '',
                content: content ? content.trim() : ''
            };
        }).filter(notice => notice.title && notice.content);
    }

    initializeFormData() {
        // Initialize form data based on field configurations
        const initialData = {};
        this.parsedSections.forEach(section => {
            section.fields.forEach(field => {
                if (field.fieldName) {
                    const defaultValue = this.getDefaultValue(field);
                    console.log(`initializeFormData - Setting ${field.fieldName} = ${defaultValue} (${typeof defaultValue})`);
                    initialData[field.fieldName] = defaultValue;
                }
            });
        });
        this.formData = { ...this.formData, ...initialData };
        console.log('initializeFormData - Final formData after initialization:', JSON.stringify(this.formData, null, 2));
    }

    getDefaultValue(field) {
        switch (field.type) {
            case 'checkbox':
                return field.defaultValue !== undefined ? field.defaultValue : false;
            case 'radio':
                if (field.defaultValue !== undefined) {
                    // Ensure boolean radio defaults are actual booleans
                    if (field.defaultValue === 'true') return true;
                    if (field.defaultValue === 'false') return false;
                    return field.defaultValue;
                }
                if (field.options && field.options.length > 0) {
                    const firstValue = field.options[0].value;
                    // Ensure boolean radio values are actual booleans
                    if (firstValue === 'true') return true;
                    if (firstValue === 'false') return false;
                    return firstValue;
                }
                return '';
            case 'combobox':
                return field.defaultValue !== undefined ? field.defaultValue : '';
            default:
                return field.defaultValue !== undefined ? field.defaultValue : '';
        }
    }

    // Computed properties for dynamic rendering
    get dynamicSections() {
        return this.parsedSections.filter(section => {
            if (!section.visible) return false;
            // Remove logic that hides the whole contact section
            return true;
        }).sort((a, b) => a.order - b.order)
        .map(section => ({
            ...section,
            fields: section.fields.map(field => this.processFieldForTemplate(field))
        }));
    }

    processFieldForTemplate(field) {
        const processedField = {
            ...field,
            value: this.getFieldValue(field.fieldName),
            isRequired: this.isFieldRequired(field),
            options: this.getFieldOptions(field),
            containerStyle: `width: ${this.getFieldWidth(field)};`,
            max: field.type === 'date' ? this.today : undefined
        };

        // Apply field-specific conditional visibility
        if (field.fieldName === 'preferredContactMethod') {
            processedField.isVisible = this.evaluateCondition(this.preferredContactVisible);
        } else if (field.fieldName === 'reporterName') {
            processedField.isVisible = this.evaluateCondition(this.reporterNameVisible);
        } else if (field.fieldName === 'reporterPhone') {
            processedField.isVisible = this.evaluateCondition(this.reporterPhoneVisible);
        } else if (field.fieldName === 'consentToContact') {
            processedField.isVisible = this.evaluateCondition(this.consentToContactVisible);
        } else if (field.fieldName === 'reporterEmail') {
            processedField.isVisible = true; // Always visible
        } else {
            processedField.isVisible = true;
        }

        // Add field type flags for template conditional rendering
        processedField.isTextInput = ['text', 'email', 'tel', 'date'].includes(field.type);
        processedField.isCheckbox = field.type === 'checkbox';
        processedField.isRadio = field.type === 'radio';
        processedField.isCombobox = field.type === 'combobox';
        processedField.isTextarea = field.type === 'textarea';

        return processedField;
    }

    evaluateCondition(condition) {
        try {
            // Simple condition evaluation for common cases
            // Replace formData references with actual values
            let evalCondition = condition;
            
            // Handle common patterns
            evalCondition = evalCondition.replace(/formData\.(\w+)/g, (match, fieldName) => {
                return JSON.stringify(this.formData[fieldName]);
            });
            
            // Handle boolean operators
            evalCondition = evalCondition.replace(/&&/g, '&&');
            evalCondition = evalCondition.replace(/\|\|/g, '||');
            
            // Use Function constructor for safe evaluation
            return new Function('return ' + evalCondition)();
        } catch (error) {
            console.warn('Error evaluating condition:', condition, error);
            return true;
        }
    }

    // Form styling computed properties
    get formContainerStyle() {
        const width = this.getConfigValue('formWidth', this.formWidth);
        const maxWidth = this.getConfigValue('formMaxWidth', this.formMaxWidth);
        return `width: ${width}; max-width: ${maxWidth};`;
    }

    get formContainerClass() {
        return 'oig-form-container slds-card slds-p-around_large';
    }

    // Dynamic field rendering helpers
    getFieldOptions(field) {
        console.log('getFieldOptions called for field:', field.id, 'optionsSource:', field.optionsSource);
        
        if (field.options) {
            console.log('Using field.options:', field.options);
            return field.options;
        }
        if (field.optionsSource) {
            switch (field.optionsSource) {
                case 'categoryOptions':
                    console.log('Using categoryOptions:', this.categoryOptions);
                    return this.categoryOptions;
                case 'severityOptions':
                    console.log('Using severityOptions:', this.severityOptions);
                    return this.severityOptions;
                default:
                    console.log('Unknown optionsSource:', field.optionsSource);
                    return [];
            }
        }
        console.log('No options found for field:', field.id);
        return [];
    }

    getFieldValue(fieldName) {
        if (typeof this.formData[fieldName] === 'boolean') {
            return this.formData[fieldName];
        }
        return this.formData[fieldName] || '';
    }

    isFieldRequired(field) {
        if (field.required === false) return false;
        
        // Email is always required
        if (field.fieldName === 'reporterEmail') {
            return true;
        }
        
        // Name is required for non-anonymous submissions
        if (field.fieldName === 'reporterName') {
            return !this.formData.isAnonymous;
        }
        
        return field.required === true;
    }

    getFieldWidth(field) {
        return field.width || '100%';
    }

    // Event handlers
    handleInputChange(event) {
        const fieldName = event.target.dataset.field;
        let value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        
        console.log('handleInputChange - fieldName:', fieldName, 'original value:', value, 'type:', typeof value, 'input type:', event.target.type);
        
        // Convert string boolean values to actual booleans for radio buttons
        if (event.target.type === 'radio' && (value === 'true' || value === 'false')) {
            const originalValue = value;
            value = value === 'true';
            console.log('Boolean conversion - original:', originalValue, 'converted:', value, 'type:', typeof value);
        }
        
        this.formData = {
            ...this.formData,
            [fieldName]: value
        };

        console.log('Updated formData:', JSON.stringify(this.formData, null, 2));

        // Handle special field logic
        this.handleSpecialFieldLogic(fieldName, value);

        // Clear any previous errors when user starts typing
        if (this.error) {
            this.error = null;
        }
    }

    handleSpecialFieldLogic(fieldName, value) {
        // Handle anonymous toggle
        if (fieldName === 'isAnonymous') {
            if (value) {
                // Clear contact fields when switching to anonymous
                this.formData = {
                    ...this.formData,
                    reporterName: '',
                    reporterPhone: '',
                    consentToContact: false,
                    preferredContactMethod: 'Email'
                    // Keep email field as optional for anonymous ID delivery
                };
            } else {
                // Set defaults for identified submission
                this.formData = {
                    ...this.formData,
                    consentToContact: true,
                    preferredContactMethod: 'Email'
                };
            }
        }

        // Handle consent to contact
        if (fieldName === 'consentToContact' && !value) {
            this.formData = {
                ...this.formData,
                preferredContactMethod: 'Do Not Contact'
            };
        }
    }

    async handleSubmit(event) {
        console.log('🚀 SUBMIT BUTTON CLICKED - Starting form submission');
        event.preventDefault();
        
        if (!this.isFormValid()) {
            this.showToast('Error', 'Please complete all required fields.', 'error');
            return;
        }

        this.isLoading = true;
        this.error = null;

        console.log('handleSubmit - Final formData before submission:', JSON.stringify(this.formData, null, 2));

        // Clean up any string boolean values before sending to Apex
        const cleanFormData = { ...this.formData };
        
        // Convert all string boolean values to actual booleans
        Object.keys(cleanFormData).forEach(key => {
            if (typeof cleanFormData[key] === 'string') {
                if (cleanFormData[key] === 'true') {
                    cleanFormData[key] = true;
                } else if (cleanFormData[key] === 'false') {
                    cleanFormData[key] = false;
                }
            }
        });
        
        try {
            const jsonString = JSON.stringify(cleanFormData);
            console.log('📤 Final JSON string being sent to Apex:', jsonString);
            
            const result = await submitOIGReport({ 
                reportDataJson: jsonString
            });

            if (result.success) {
                this.submissionResult = result;
                this.isSubmitted = true;
                
                // Show different success messages based on submission type
                if (this.formData.isAnonymous) {
                    this.showToast('Success', 
                        `Your anonymous OIG report has been submitted successfully. An email with your Anonymous ID (${result.anonymousId}) has been sent to your email address.`, 
                        'success');
                } else {
                    this.showToast('Success', 'Your OIG report has been submitted successfully.', 'success');
                }
            } else {
                this.error = result.errorMessage;
                this.showToast('Error', result.errorMessage, 'error');
                console.error('Apex returned error:', result.errorMessage);
            }
        } catch (error) {
            this.error = 'An unexpected error occurred. Please try again.';
            this.showToast('Error', this.error, 'error');
            console.error('Submission error:', error);
        } finally {
            this.isLoading = false;
        }
    }

    handleReset() {
        this.initializeFormData();
        this.error = null;
        this.isSubmitted = false;
        this.submissionResult = null;
    }

    handleSubmitAnother() {
        this.handleReset();
    }

    // View submissions functionality
    handleModeChange(event) {
        this.currentMode = event.target.dataset.mode;
        this.error = null;
        this.existingSubmissions = [];
    }

    handleViewSubmissionInputChange(event) {
        const fieldName = event.target.dataset.field;
        const value = event.target.value;
        
        this.viewSubmissionsData = {
            ...this.viewSubmissionsData,
            [fieldName]: value
        };
    }

    handleLookupTypeChange(event) {
        this.viewSubmissionsData = {
            ...this.viewSubmissionsData,
            isAnonymousLookup: event.target.value === 'anonymous',
            anonymousId: '',
            fullName: '',
            email: ''
        };
    }

    async handleViewSubmissions() {
        this.isLoadingSubmissions = true;
        this.error = null;
        
        try {
            let result;
            if (this.viewSubmissionsData.isAnonymousLookup) {
                if (!this.viewSubmissionsData.anonymousId.trim()) {
                    this.showToast('Error', 'Please enter your Anonymous ID.', 'error');
                    return;
                }
                result = await getSubmissionsByAnonymousId({ 
                    anonymousId: this.viewSubmissionsData.anonymousId.trim()
                });
            } else {
                if (!this.viewSubmissionsData.fullName.trim() || !this.viewSubmissionsData.email.trim()) {
                    this.showToast('Error', 'Please enter both your full name and email address.', 'error');
                    return;
                }
                result = await getSubmissionsByContact({ 
                    fullName: this.viewSubmissionsData.fullName.trim(),
                    email: this.viewSubmissionsData.email.trim()
                });
            }

            if (result.success) {
                this.existingSubmissions = result.submissions || [];
                if (this.existingSubmissions.length === 0) {
                    this.showToast('Info', 'No submissions found matching your criteria.', 'info');
                }
            } else {
                this.error = result.errorMessage;
                this.showToast('Error', result.errorMessage, 'error');
            }
        } catch (error) {
            this.error = 'An error occurred while retrieving submissions.';
            this.showToast('Error', this.error, 'error');
            console.error('View submissions error:', error);
        } finally {
            this.isLoadingSubmissions = false;
        }
    }

    // Validation methods
    isFormValid() {
        console.log('dynamicSections', JSON.stringify(this.dynamicSections, null, 2));
        console.log('formData', JSON.stringify(this.formData, null, 2));
        const allFields = [];
        this.dynamicSections.forEach(section => {
            section.fields.forEach(field => {
                if (field.isRequired && field.isVisible) {
                    allFields.push(field);
                }
            });
        });

        for (const field of allFields) {
            const value = this.formData[field.fieldName];
            if (
                value === undefined ||
                value === null ||
                (typeof value === 'string' && value.trim() === '')
            ) {
                return false;
            }
            if (field.type === 'email' && value && !this.isValidEmail(value)) {
                return false;
            }
        }
        return true;
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant,
        });
        this.dispatchEvent(evt);
    }

    // Computed properties for template
    get isSubmitDisabled() {
        return this.isLoading || !this.isFormValid();
    }

    get showForm() {
        return !this.isSubmitted;
    }

    get showSuccess() {
        return this.isSubmitted && this.submissionResult && this.submissionResult.success;
    }

    get today() {
        return new Date().toISOString().split('T')[0];
    }

    get hasNotices() {
        return this.parsedNotices && this.parsedNotices.length > 0;
    }

    // Mode and view submission computed properties
    get isSubmitMode() {
        return this.currentMode === 'submit';
    }

    get isViewMode() {
        return this.currentMode === 'view';
    }

    get showAnonymousLookup() {
        return this.isViewMode && this.viewSubmissionsData.isAnonymousLookup;
    }

    get showContactLookup() {
        return this.isViewMode && !this.viewSubmissionsData.isAnonymousLookup;
    }

    get hasExistingSubmissions() {
        return this.existingSubmissions && this.existingSubmissions.length > 0;
    }

    get isViewSubmissionsDisabled() {
        if (this.viewSubmissionsData.isAnonymousLookup) {
            return !this.viewSubmissionsData.anonymousId.trim() || this.isLoadingSubmissions;
        } else {
            return !this.viewSubmissionsData.fullName.trim() || !this.viewSubmissionsData.email.trim() || this.isLoadingSubmissions;
        }
    }

    get lookupTypeOptions() {
        return [
            { label: 'I have my Anonymous ID', value: 'anonymous' },
            { label: 'I provided my contact information', value: 'contact' }
        ];
    }

    get submitModeVariant() {
        return this.isSubmitMode ? 'brand' : 'neutral';
    }

    get viewModeVariant() {
        return this.isViewMode ? 'brand' : 'neutral';
    }

    get lookupTypeValue() {
        return this.viewSubmissionsData.isAnonymousLookup ? 'anonymous' : 'contact';
    }
} 