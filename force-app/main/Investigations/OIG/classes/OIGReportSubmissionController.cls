public with sharing class OIGReportSubmissionController {
    
    /**
     * Result wrapper for OIG report submissions
     */
    public class OIGSubmissionResult {
        @AuraEnabled public Boolean success { get; set; }
        @AuraEnabled public String reportId { get; set; }
        @AuraEnabled public String reportNumber { get; set; }
        @AuraEnabled public String anonymousId { get; set; }
        @AuraEnabled public String errorMessage { get; set; }
        
        public OIGSubmissionResult() {
            this.success = false;
        }
    }

    /**
     * Result wrapper for viewing submissions
     */
    public class ViewSubmissionsResult {
        @AuraEnabled public Boolean success { get; set; }
        @AuraEnabled public List<SubmissionSummary> submissions { get; set; }
        @AuraEnabled public String errorMessage { get; set; }
        
        public ViewSubmissionsResult() {
            this.success = false;
            this.submissions = new List<SubmissionSummary>();
        }
    }

    /**
     * Submission summary for display
     */
    public class SubmissionSummary {
        @AuraEnabled public String Id { get; set; }
        @AuraEnabled public String Name { get; set; }
        @AuraEnabled public String Status { get; set; }
        @AuraEnabled public String Category { get; set; }
        @AuraEnabled public String Severity { get; set; }
        @AuraEnabled public String ReportDetails { get; set; }
        @AuraEnabled public String AnonymousId { get; set; }
        @AuraEnabled public DateTime CreatedDate { get; set; }
    }

    /**
     * OIG Report data structure
     */
    public class OIGReportData {
        public String reporterName { get; set; }
        public String reporterEmail { get; set; }
        public String reporterPhone { get; set; }
        public String category { get; set; }
        public String severity { get; set; }
        public String reportDetails { get; set; }
        public String incidentLocation { get; set; }
        public String incidentDate { get; set; }
        public String witnessInfo { get; set; }
        public String submissionSource { get; set; }
        public Boolean isAnonymous { get; set; }
        public String preferredContactMethod { get; set; }
        public Boolean consentToContact { get; set; }
    }
    
    /**
     * Submit OIG report with validation and proper record creation
     */
    @AuraEnabled
    public static OIGSubmissionResult submitOIGReport(String reportDataJson) {
        OIGSubmissionResult result = new OIGSubmissionResult();
        
        try {
            // Log the incoming JSON for debugging
            System.debug('🚀 APEX submitOIGReport called');
            System.debug('📦 Received JSON: ' + reportDataJson);
            System.debug('📏 JSON Length: ' + reportDataJson.length());
            
            // Check character at position 307 (where error occurs)
            if (reportDataJson.length() > 307) {
                System.debug('🔍 Character at position 307: "' + reportDataJson.substring(307, 308) + '"');
                System.debug('🔍 Context around position 307: "' + reportDataJson.substring(Math.max(0, 302), Math.min(reportDataJson.length(), 312)) + '"');
            }
            
            // Look for boolean issues in the JSON
            if (reportDataJson.contains('"true"') || reportDataJson.contains('"false"')) {
                System.debug('⚠️ Found quoted boolean values in JSON');
                System.debug('⚠️ Locations of "true": ' + reportDataJson.indexOf('"true"'));
                System.debug('⚠️ Locations of "false": ' + reportDataJson.indexOf('"false"'));
            }
            
            // Parse the report data
            OIGReportData reportData = (OIGReportData) JSON.deserialize(reportDataJson, OIGReportData.class);
            System.debug('✅ JSON deserialization successful');
            System.debug('📊 Parsed data - isAnonymous: ' + reportData.isAnonymous + ' (type: Boolean)');
            System.debug('📊 Parsed data - consentToContact: ' + reportData.consentToContact + ' (type: Boolean)');
            
            // Validate required fields
            if (!validateReportData(reportData)) {
                result.errorMessage = 'Please complete all required fields.';
                return result;
            }
            
            // Get OIG Record Type
            Id oigRecordTypeId = getOIGRecordTypeId();
            if (oigRecordTypeId == null) {
                result.errorMessage = 'OIG record type not found. Please contact system administrator.';
                return result;
            }
            
            // Create Whistleblower Report with OIG fields
            Whistleblower_Report__c report = new Whistleblower_Report__c();
            
            // Set record type
            report.RecordTypeId = oigRecordTypeId;
            
            // Set basic fields
            report.Reporter_Name_Text__c = reportData.isAnonymous ? null : reportData.reporterName;
            report.Reporter_Email_Text__c = reportData.reporterEmail; // Always store email for anonymous ID delivery
            report.Reporter_Phone_Text__c = reportData.isAnonymous ? null : reportData.reporterPhone;
            
            // Set OIG-specific fields
            report.Category__c = reportData.category;
            report.Severity__c = reportData.severity;
            report.Report_Details__c = reportData.reportDetails;
            report.Incident_Location__c = reportData.incidentLocation;
            report.Submission_Source__c = reportData.submissionSource != null ? reportData.submissionSource : 'Web Portal';
            report.Status__c = 'New Submission';
            report.Anonymous__c = reportData.isAnonymous;
            report.Consent_To_Contact__c = reportData.consentToContact;
            
            // Handle incident date
            if (String.isNotBlank(reportData.incidentDate)) {
                try {
                    report.Incident_Date__c = Date.valueOf(reportData.incidentDate);
                } catch (Exception e) {
                    // Handle date parsing error silently, field is optional
                }
            }
            
            // Set witness information if provided
            if (String.isNotBlank(reportData.witnessInfo)) {
                report.Witness_Information__c = reportData.witnessInfo;
            }
            
            // Generate anonymous ID for tracking
            if (reportData.isAnonymous) {
                report.Anonymous_ID_Text__c = generateAnonymousId();
            }
            
            // Set preferred contact method
            if (String.isNotBlank(reportData.preferredContactMethod)) {
                report.Preferred_Contact_Method__c = reportData.preferredContactMethod;
            }
            
            // Insert the record
            insert report;
            
            // Prepare success response
            result.success = true;
            result.reportId = report.Id;
            result.anonymousId = report.Anonymous_ID_Text__c;
            
            // Get the report number (auto-generated)
            Whistleblower_Report__c insertedReport = [
                SELECT Name FROM Whistleblower_Report__c 
                WHERE Id = :report.Id LIMIT 1
            ];
            result.reportNumber = insertedReport.Name;
            
            // Send confirmation email if email address provided
            if (String.isNotBlank(reportData.reporterEmail)) {
                sendConfirmationEmail(reportData.reporterEmail, report.Anonymous_ID_Text__c, insertedReport.Name, reportData.isAnonymous);
            }
            
            return result;
            
        } catch (System.JSONException jsonEx) {
            result.errorMessage = 'An error occurred while submitting your report: ' + jsonEx.getMessage();
            System.debug('❌ JSON Deserialization Error: ' + jsonEx.getMessage());
            System.debug('❌ JSON Stack Trace: ' + jsonEx.getStackTraceString());
            System.debug('❌ Problematic JSON: ' + reportDataJson);
            return result;
        } catch (Exception e) {
            result.errorMessage = 'An error occurred while submitting your report: ' + e.getMessage();
            System.debug('❌ General Submission Error: ' + e.getMessage());
            System.debug('❌ Error Type: ' + e.getTypeName());
            System.debug('❌ Stack Trace: ' + e.getStackTraceString());
            return result;
        }
    }
    
    /**
     * Get available category options for OIG reports
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getCategoryOptions() {
        List<Map<String, String>> options = new List<Map<String, String>>();
        
        try {
            // Get OIG Record Type ID
            Id oigRecordTypeId = getOIGRecordTypeId();
            System.debug('OIG Record Type ID: ' + oigRecordTypeId);
            
            // Get picklist values for the field
            Schema.DescribeFieldResult fieldResult = Whistleblower_Report__c.Category__c.getDescribe();
            List<Schema.PicklistEntry> picklistValues = fieldResult.getPicklistValues();
            System.debug('Total picklist values found: ' + picklistValues.size());
            
            for (Schema.PicklistEntry entry : picklistValues) {
                System.debug('Picklist entry: ' + entry.getLabel() + ' = ' + entry.getValue() + ' (Active: ' + entry.isActive() + ')');
                if (entry.isActive()) {
                    options.add(new Map<String, String>{
                        'label' => entry.getLabel(),
                        'value' => entry.getValue()
                    });
                }
            }
            
            System.debug('Final category options: ' + options);
        } catch (Exception e) {
            System.debug('Error getting category options: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
        }
        
        return options;
    }
    
    /**
     * Get severity options
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getSeverityOptions() {
        List<Map<String, String>> options = new List<Map<String, String>>();
        
        try {
            Schema.DescribeFieldResult fieldResult = Whistleblower_Report__c.Severity__c.getDescribe();
            List<Schema.PicklistEntry> picklistValues = fieldResult.getPicklistValues();
            System.debug('Total severity picklist values found: ' + picklistValues.size());
            
            for (Schema.PicklistEntry entry : picklistValues) {
                System.debug('Severity picklist entry: ' + entry.getLabel() + ' = ' + entry.getValue() + ' (Active: ' + entry.isActive() + ')');
                if (entry.isActive()) {
                    options.add(new Map<String, String>{
                        'label' => entry.getLabel(),
                        'value' => entry.getValue()
                    });
                }
            }
            
            System.debug('Final severity options: ' + options);
        } catch (Exception e) {
            System.debug('Error getting severity options: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
        }
        
        return options;
    }

    /**
     * Get submissions by anonymous ID
     */
    @AuraEnabled
    public static ViewSubmissionsResult getSubmissionsByAnonymousId(String anonymousId) {
        ViewSubmissionsResult result = new ViewSubmissionsResult();
        
        try {
            if (String.isBlank(anonymousId)) {
                result.errorMessage = 'Please enter your Anonymous ID.';
                return result;
            }
            
            List<Whistleblower_Report__c> reports = [
                SELECT Id, Name, Status__c, Category__c, Severity__c, 
                       Report_Details__c, Anonymous_ID_Text__c, CreatedDate
                FROM Whistleblower_Report__c 
                WHERE Anonymous_ID_Text__c = :anonymousId.trim()
                AND RecordType.DeveloperName = 'OIG_Intake'
                ORDER BY CreatedDate DESC
            ];
            
            for (Whistleblower_Report__c report : reports) {
                SubmissionSummary summary = new SubmissionSummary();
                summary.Id = report.Id;
                summary.Name = report.Name;
                summary.Status = report.Status__c;
                summary.Category = report.Category__c;
                summary.Severity = report.Severity__c;
                summary.ReportDetails = report.Report_Details__c;
                summary.AnonymousId = report.Anonymous_ID_Text__c;
                summary.CreatedDate = report.CreatedDate;
                result.submissions.add(summary);
            }
            
            result.success = true;
            return result;
            
        } catch (Exception e) {
            result.errorMessage = 'An error occurred while retrieving submissions: ' + e.getMessage();
            return result;
        }
    }

    /**
     * Get submissions by contact information
     */
    @AuraEnabled
    public static ViewSubmissionsResult getSubmissionsByContact(String fullName, String email) {
        ViewSubmissionsResult result = new ViewSubmissionsResult();
        
        try {
            if (String.isBlank(fullName) || String.isBlank(email)) {
                result.errorMessage = 'Please enter both your name and email address.';
                return result;
            }
            
            List<Whistleblower_Report__c> reports = [
                SELECT Id, Name, Status__c, Category__c, Severity__c, 
                       Report_Details__c, Anonymous_ID_Text__c, CreatedDate
                FROM Whistleblower_Report__c 
                WHERE Reporter_Name_Text__c = :fullName.trim()
                AND Reporter_Email_Text__c = :email.trim()
                AND RecordType.DeveloperName = 'OIG_Intake'
                AND Anonymous__c = false
                ORDER BY CreatedDate DESC
            ];
            
            for (Whistleblower_Report__c report : reports) {
                SubmissionSummary summary = new SubmissionSummary();
                summary.Id = report.Id;
                summary.Name = report.Name;
                summary.Status = report.Status__c;
                summary.Category = report.Category__c;
                summary.Severity = report.Severity__c;
                summary.ReportDetails = report.Report_Details__c;
                summary.AnonymousId = report.Anonymous_ID_Text__c;
                summary.CreatedDate = report.CreatedDate;
                result.submissions.add(summary);
            }
            
            result.success = true;
            return result;
            
        } catch (Exception e) {
            result.errorMessage = 'An error occurred while retrieving submissions: ' + e.getMessage();
            return result;
        }
    }
    
    /**
     * Validate required report data
     */
    private static Boolean validateReportData(OIGReportData reportData) {
        // Category and report details are always required
        if (String.isBlank(reportData.category) || String.isBlank(reportData.reportDetails)) {
            return false;
        }
        
        // If not anonymous, name and email are required
        if (!reportData.isAnonymous) {
            if (String.isBlank(reportData.reporterName) || String.isBlank(reportData.reporterEmail)) {
                return false;
            }
            
            // Basic email validation
            if (!isValidEmail(reportData.reporterEmail)) {
                return false;
            }
        } else {
            // For anonymous submissions, email is optional
            // If email is provided, validate it
            if (String.isNotBlank(reportData.reporterEmail) && !isValidEmail(reportData.reporterEmail)) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * Get OIG Record Type ID
     */
    private static Id getOIGRecordTypeId() {
        try {
            return Schema.SObjectType.Whistleblower_Report__c.getRecordTypeInfosByDeveloperName()
                   .get('OIG_Intake').getRecordTypeId();
        } catch (Exception e) {
            System.debug('Error getting OIG Record Type: ' + e.getMessage());
            return null;
        }
    }
    
    /**
     * Generate unique anonymous ID for tracking
     */
    private static String generateAnonymousId() {
        String chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        String randomId = 'OIG-';
        
        for (Integer i = 0; i < 8; i++) {
            Integer randomIndex = Math.mod(Math.abs(Crypto.getRandomInteger()), chars.length());
            randomId += chars.substring(randomIndex, randomIndex + 1);
        }
        
        return randomId;
    }
    
    /**
     * Basic email validation
     */
    private static Boolean isValidEmail(String email) {
        String emailRegex = '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$';
        Pattern emailPattern = Pattern.compile(emailRegex);
        return emailPattern.matcher(email).matches();
    }

    /**
     * Send confirmation email to reporter (both anonymous and identified submissions)
     */
    private static void sendConfirmationEmail(String reporterEmail, String anonymousId, String reportNumber, Boolean isAnonymous) {
        try {
            Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
            email.setToAddresses(new String[] { reporterEmail });
            
            String emailBody = 'Dear Reporter,\n\n';
            emailBody += 'Thank you for submitting a report to the Office of Inspector General (OIG).\n\n';
            
            if (isAnonymous) {
                email.setSubject('OIG Report Confirmation - Anonymous Submission');
                emailBody += 'Your report has been successfully submitted as an anonymous report.\n\n';
                emailBody += 'Report Details:\n';
                emailBody += '• Report Number: ' + reportNumber + '\n';
                emailBody += '• Anonymous ID: ' + anonymousId + '\n\n';
                emailBody += 'IMPORTANT: Please save your Anonymous ID (' + anonymousId + ') to track the status of your report.\n\n';
                emailBody += 'Tracking Information:\n';
                emailBody += '• Use your Anonymous ID to check report status through our portal\n';
                emailBody += '• Keep this Anonymous ID confidential and secure\n';
                emailBody += '• You can view your submission anytime using this ID\n\n';
            } else {
                email.setSubject('OIG Report Confirmation - Report #' + reportNumber);
                emailBody += 'Your report has been successfully submitted and assigned Report Number: ' + reportNumber + '\n\n';
                emailBody += 'What happens next:\n';
                emailBody += '• Your report will undergo an initial review within 5 business days\n';
                emailBody += '• You will be contacted for any follow-up questions or additional information\n';
                emailBody += '• You can check your submission status using your name and email in our portal\n\n';
            }
            
            emailBody += 'Review Process:\n';
            emailBody += '• All reports are handled confidentially according to OIG protocols\n';
            emailBody += '• Your report will be reviewed and investigated as appropriate\n';
            emailBody += '• You are protected under federal whistleblower protection laws\n\n';
            
            emailBody += 'Contact Information:\n';
            emailBody += 'If you have questions about your submission, please reference Report Number: ' + reportNumber;
            if (isAnonymous) {
                emailBody += ' or Anonymous ID: ' + anonymousId;
            }
            emailBody += '\n\n';
            
            emailBody += 'Thank you for helping to maintain integrity and accountability in government operations.\n\n';
            emailBody += 'Office of Inspector General\n';
            emailBody += 'Confidential Reporting Portal';
            
            email.setPlainTextBody(emailBody);
            
            // Send the email
            Messaging.sendEmail(new Messaging.SingleEmailMessage[] { email });
            
        } catch (Exception e) {
            // Log error but don't fail the submission
            System.debug('Error sending confirmation email: ' + e.getMessage());
        }
    }
} 