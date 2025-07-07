@isTest
public class OIGReportSubmissionControllerTest {
    
    @testSetup
    static void setupTestData() {
        // No test data needed as we're testing the controller directly
    }
    
    @isTest
    static void testSubmitOIGReport_Success_WithContact() {
        // Create test data
        String reportDataJson = JSON.serialize(new Map<String, Object>{
            'reporterName' => 'Test Reporter',
            'reporterEmail' => 'test@example.com',
            'reporterPhone' => '555-123-4567',
            'category' => 'Fraud - Financial',
            'severity' => 'High',
            'reportDetails' => 'Test report details for financial fraud',
            'incidentLocation' => 'Test Building',
            'incidentDate' => '2024-01-15',
            'witnessInfo' => 'John Doe, jane@example.com',
            'submissionSource' => 'Web Portal',
            'isAnonymous' => false,
            'preferredContactMethod' => 'Email',
            'consentToContact' => true
        });
        
        Test.startTest();
        OIGReportSubmissionController.OIGSubmissionResult result = 
            OIGReportSubmissionController.submitOIGReport(reportDataJson);
        Test.stopTest();
        
        // Verify results
        System.assert(result.success, 'Submission should be successful');
        System.assertNotEquals(null, result.reportId, 'Report ID should be set');
        System.assertNotEquals(null, result.reportNumber, 'Report number should be set');
        System.assertEquals(null, result.anonymousId, 'Anonymous ID should be null for non-anonymous reports');
        System.assertEquals(null, result.errorMessage, 'Error message should be null');
        
        // Verify record was created correctly
        Whistleblower_Report__c createdReport = [
            SELECT Id, Name, Reporter_Name_Text__c, Reporter_Email_Text__c, Category__c, 
                   Status__c, Submission_Source__c, Anonymous__c, Severity__c
            FROM Whistleblower_Report__c 
            WHERE Id = :result.reportId
        ];
        
        System.assertEquals('Test Reporter', createdReport.Reporter_Name_Text__c);
        System.assertEquals('test@example.com', createdReport.Reporter_Email_Text__c);
        System.assertEquals('Fraud - Financial', createdReport.Category__c);
        System.assertEquals('New Submission', createdReport.Status__c);
        System.assertEquals('Web Portal', createdReport.Submission_Source__c);
        System.assertEquals(false, createdReport.Anonymous__c);
        System.assertEquals('High', createdReport.Severity__c);
    }
    
    @isTest
    static void testSubmitOIGReport_Success_Anonymous() {
        // Create anonymous test data
        String reportDataJson = JSON.serialize(new Map<String, Object>{
            'category' => 'Waste of Government Resources',
            'severity' => 'Medium',
            'reportDetails' => 'Anonymous report of resource waste',
            'incidentLocation' => 'Anonymous Location',
            'isAnonymous' => true,
            'submissionSource' => 'Web Portal',
            'consentToContact' => false
        });
        
        Test.startTest();
        OIGReportSubmissionController.OIGSubmissionResult result = 
            OIGReportSubmissionController.submitOIGReport(reportDataJson);
        Test.stopTest();
        
        // Verify results
        System.assert(result.success, 'Anonymous submission should be successful');
        System.assertNotEquals(null, result.reportId, 'Report ID should be set');
        System.assertNotEquals(null, result.anonymousId, 'Anonymous ID should be set');
        System.assert(result.anonymousId.startsWith('OIG-'), 'Anonymous ID should start with OIG-');
        System.assertEquals(null, result.errorMessage, 'Error message should be null');
        
        // Verify record was created correctly
        Whistleblower_Report__c createdReport = [
            SELECT Id, Reporter_Name_Text__c, Reporter_Email_Text__c, Category__c, 
                   Anonymous__c, Anonymous_ID_Text__c, Status__c
            FROM Whistleblower_Report__c 
            WHERE Id = :result.reportId
        ];
        
        System.assertEquals(null, createdReport.Reporter_Name_Text__c);
        System.assertEquals(null, createdReport.Reporter_Email_Text__c);
        System.assertEquals('Waste of Government Resources', createdReport.Category__c);
        System.assertEquals(true, createdReport.Anonymous__c);
        System.assertNotEquals(null, createdReport.Anonymous_ID_Text__c);
        System.assertEquals('New Submission', createdReport.Status__c);
    }
    
    @isTest
    static void testSubmitOIGReport_ValidationError_MissingCategory() {
        // Create test data missing required category
        String reportDataJson = JSON.serialize(new Map<String, Object>{
            'reporterName' => 'Test Reporter',
            'reporterEmail' => 'test@example.com',
            'reportDetails' => 'Test report details',
            'isAnonymous' => false
        });
        
        Test.startTest();
        OIGReportSubmissionController.OIGSubmissionResult result = 
            OIGReportSubmissionController.submitOIGReport(reportDataJson);
        Test.stopTest();
        
        // Verify validation error
        System.assert(!result.success, 'Submission should fail validation');
        System.assertEquals('Please complete all required fields.', result.errorMessage);
        System.assertEquals(null, result.reportId, 'Report ID should be null');
    }
    
    @isTest
    static void testSubmitOIGReport_ValidationError_MissingContactInfo() {
        // Create test data missing contact info for non-anonymous report
        String reportDataJson = JSON.serialize(new Map<String, Object>{
            'category' => 'Fraud - Financial',
            'reportDetails' => 'Test report details',
            'isAnonymous' => false
        });
        
        Test.startTest();
        OIGReportSubmissionController.OIGSubmissionResult result = 
            OIGReportSubmissionController.submitOIGReport(reportDataJson);
        Test.stopTest();
        
        // Verify validation error
        System.assert(!result.success, 'Submission should fail validation');
        System.assertEquals('Please complete all required fields.', result.errorMessage);
    }
    
    @isTest
    static void testSubmitOIGReport_ValidationError_InvalidEmail() {
        // Create test data with invalid email
        String reportDataJson = JSON.serialize(new Map<String, Object>{
            'reporterName' => 'Test Reporter',
            'reporterEmail' => 'invalid-email',
            'category' => 'Fraud - Financial',
            'reportDetails' => 'Test report details',
            'isAnonymous' => false
        });
        
        Test.startTest();
        OIGReportSubmissionController.OIGSubmissionResult result = 
            OIGReportSubmissionController.submitOIGReport(reportDataJson);
        Test.stopTest();
        
        // Verify validation error
        System.assert(!result.success, 'Submission should fail validation');
        System.assertEquals('Please complete all required fields.', result.errorMessage);
    }
    
    @isTest
    static void testSubmitOIGReport_JsonParseError() {
        // Test with invalid JSON
        String invalidJson = '{"invalid": json}';
        
        Test.startTest();
        OIGReportSubmissionController.OIGSubmissionResult result = 
            OIGReportSubmissionController.submitOIGReport(invalidJson);
        Test.stopTest();
        
        // Verify error handling
        System.assert(!result.success, 'Submission should fail');
        System.assert(result.errorMessage.contains('error occurred'), 'Should contain error message');
    }
    
    @isTest
    static void testGetCategoryOptions() {
        Test.startTest();
        List<Map<String, String>> options = OIGReportSubmissionController.getCategoryOptions();
        Test.stopTest();
        
        // Verify options are returned
        System.assert(options.size() > 0, 'Should return category options');
        
        // Verify structure
        for (Map<String, String> option : options) {
            System.assert(option.containsKey('label'), 'Should have label');
            System.assert(option.containsKey('value'), 'Should have value');
        }
    }
    
    @isTest
    static void testGetSeverityOptions() {
        Test.startTest();
        List<Map<String, String>> options = OIGReportSubmissionController.getSeverityOptions();
        Test.stopTest();
        
        // Verify standard severity options
        System.assertEquals(4, options.size(), 'Should have 4 severity options');
        
        List<String> expectedValues = new List<String>{'Low', 'Medium', 'High', 'Critical'};
        for (Map<String, String> option : options) {
            System.assert(expectedValues.contains(option.get('value')), 'Should contain expected values');
        }
    }
    
    @isTest
    static void testSubmitOIGReport_WithOptionalFields() {
        // Create test data with all optional fields
        String reportDataJson = JSON.serialize(new Map<String, Object>{
            'reporterName' => 'Test Reporter',
            'reporterEmail' => 'test@example.com',
            'reporterPhone' => '555-123-4567',
            'category' => 'Ethics Violations',
            'severity' => 'Critical',
            'reportDetails' => 'Detailed ethics violation report',
            'incidentLocation' => 'Executive Office',
            'incidentDate' => '2024-01-01',
            'witnessInfo' => 'Multiple witnesses present',
            'submissionSource' => 'Web Portal',
            'isAnonymous' => false,
            'preferredContactMethod' => 'Phone',
            'consentToContact' => true
        });
        
        Test.startTest();
        OIGReportSubmissionController.OIGSubmissionResult result = 
            OIGReportSubmissionController.submitOIGReport(reportDataJson);
        Test.stopTest();
        
        // Verify success
        System.assert(result.success, 'Submission with optional fields should be successful');
        
        // Verify optional fields were saved
        Whistleblower_Report__c createdReport = [
            SELECT Id, Incident_Location__c, Incident_Date__c, Witness_Information__c,
                   Reporter_Phone_Text__c, Preferred_Contact_Method__c
            FROM Whistleblower_Report__c 
            WHERE Id = :result.reportId
        ];
        
        System.assertEquals('Executive Office', createdReport.Incident_Location__c);
        System.assertEquals(Date.valueOf('2024-01-01'), createdReport.Incident_Date__c);
        System.assertEquals('Multiple witnesses present', createdReport.Witness_Information__c);
        System.assertEquals('555-123-4567', createdReport.Reporter_Phone_Text__c);
        System.assertEquals('Phone', createdReport.Preferred_Contact_Method__c);
    }
    
    @isTest
    static void testSubmitOIGReport_InvalidDate() {
        // Create test data with invalid date format
        String reportDataJson = JSON.serialize(new Map<String, Object>{
            'reporterName' => 'Test Reporter',
            'reporterEmail' => 'test@example.com',
            'category' => 'Fraud - Financial',
            'severity' => 'High',
            'reportDetails' => 'Test report details',
            'incidentDate' => 'invalid-date',
            'isAnonymous' => false,
            'consentToContact' => true
        });
        
        Test.startTest();
        OIGReportSubmissionController.OIGSubmissionResult result = 
            OIGReportSubmissionController.submitOIGReport(reportDataJson);
        Test.stopTest();
        
        // Should still succeed, invalid dates are handled gracefully
        System.assert(result.success, 'Should succeed even with invalid date: ' + result.errorMessage);
        
        // Verify date field is null
        Whistleblower_Report__c createdReport = [
            SELECT Id, Incident_Date__c
            FROM Whistleblower_Report__c 
            WHERE Id = :result.reportId
        ];
        
        System.assertEquals(null, createdReport.Incident_Date__c, 'Invalid date should result in null');
    }
} 