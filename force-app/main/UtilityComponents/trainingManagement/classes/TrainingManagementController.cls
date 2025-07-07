public with sharing class TrainingManagementController {
    
    @AuraEnabled(cacheable=true)
    public static List<Training_Course__c> getCourses() {
        try {
            return [
                SELECT Id, Name, Course_Description__c, Duration_Hours__c, 
                       Course_Category__c, Active__c, CreatedDate
                FROM Training_Course__c 
                WHERE Active__c = true
                ORDER BY CreatedDate DESC
            ];
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving courses: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static List<SessionWithDetails> getUpcomingSessions() {
        try {
            System.debug('Starting getUpcomingSessions method');
            
            // First, try a simple query without relationships
            List<Training_Session__c> sessions;
            try {
                sessions = [
                    SELECT Id, Name, Training_Course__c, Session_Date__c, Start_Time__c, 
                           End_Time__c, Location__c, Max_Attendees__c, Instructor__c, Session_Link__c
                    FROM Training_Session__c 
                    WHERE Session_Date__c >= TODAY
                    ORDER BY Session_Date__c ASC, Start_Time__c ASC
                ];
                System.debug('Found ' + sessions.size() + ' sessions without relationships');
            } catch (Exception e) {
                System.debug('Error in basic session query: ' + e.getMessage());
                throw new AuraHandledException('Error querying sessions: ' + e.getMessage());
            }
            
            // Now try to get related data separately
            List<SessionWithDetails> sessionDetails = new List<SessionWithDetails>();
            for (Training_Session__c session : sessions) {
                try {
                    SessionWithDetails detail = new SessionWithDetails();
                    
                    // Create a safe copy of the session with related data
                    Training_Session__c safeSession = session.clone(true, true, true, true);
                    
                    // Try to get course information
                    if (session.Training_Course__c != null) {
                        try {
                            List<Training_Course__c> courses = [
                                SELECT Id, Name, Course_Description__c, Duration_Hours__c, Course_Category__c 
                                FROM Training_Course__c 
                                WHERE Id = :session.Training_Course__c
                                LIMIT 1
                            ];
                            if (!courses.isEmpty()) {
                                safeSession.Training_Course__r = courses[0];
                            }
                        } catch (Exception e) {
                            System.debug('Error getting course for session ' + session.Id + ': ' + e.getMessage());
                        }
                    }
                    
                    // Try to get instructor information
                    if (session.Instructor__c != null) {
                        try {
                            List<User> instructors = [
                                SELECT Id, Name, Email 
                                FROM User 
                                WHERE Id = :session.Instructor__c 
                                LIMIT 1
                            ];
                            if (!instructors.isEmpty()) {
                                safeSession.Instructor__r = instructors[0];
                            }
                        } catch (Exception e) {
                            System.debug('Error getting instructor for session ' + session.Id + ': ' + e.getMessage());
                        }
                    }
                    
                    detail.session = safeSession;
                    
                    // Safe calculation
                    try {
                        detail.attendeeCount = getAttendeeCount(session.Id);
                    } catch (Exception e) {
                        System.debug('Error getting attendee count: ' + e.getMessage());
                        detail.attendeeCount = 0;
                    }
                    
                    try {
                        detail.isUserRegistered = isUserRegistered(session.Id, UserInfo.getUserId());
                    } catch (Exception e) {
                        System.debug('Error checking user registration: ' + e.getMessage());
                        detail.isUserRegistered = false;
                    }
                    
                    Integer maxAttendees = session.Max_Attendees__c != null ? Integer.valueOf(session.Max_Attendees__c) : 0;
                    detail.spotsAvailable = maxAttendees - detail.attendeeCount;
                    
                    sessionDetails.add(detail);
                } catch (Exception e) {
                    System.debug('Error processing session ' + session.Id + ': ' + e.getMessage());
                    System.debug('Stack trace: ' + e.getStackTraceString());
                    // Continue processing other sessions
                }
            }
            
            System.debug('Returning ' + sessionDetails.size() + ' session details');
            return sessionDetails;
        } catch (Exception e) {
            System.debug('Error in getUpcomingSessions: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Error retrieving sessions: ' + e.getMessage());
        }
    }
    
    @AuraEnabled(cacheable=true)
    public static List<Training_Attendance__c> getUserAttendance() {
        try {
            return [
                SELECT Id, Training_Session__c, Training_Session__r.Name, 
                       Training_Session__r.Training_Course__r.Name, Training_Session__r.Session_Date__c,
                       Training_Session__r.Start_Time__c, Training_Session__r.End_Time__c,
                       Training_Session__r.Location__c, Training_Session__r.Session_Link__c,
                       Training_Session__r.Instructor__r.Name,
                       Attendance_Status__c, Completion_Date__c, Certificate_Issued__c
                FROM Training_Attendance__c 
                WHERE CreatedById = :UserInfo.getUserId()
                ORDER BY Training_Session__r.Session_Date__c DESC
            ];
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving user attendance: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static String createCourse(String name, String description, Decimal hours, String category) {
        try {
            Training_Course__c course = new Training_Course__c(
                Name = name,
                Course_Description__c = description,
                Duration_Hours__c = hours,
                Course_Category__c = category,
                Active__c = true
            );
            insert course;
            return 'SUCCESS';
        } catch (Exception e) {
            throw new AuraHandledException('Error creating course: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static String createSession(String courseId, Date sessionDate, String startTime, 
                                     String endTime, String location, Integer maxAttendees, String instructorId, String sessionLink) {
        try {
            System.debug('Creating session with parameters:');
            System.debug('Course ID: ' + courseId);
            System.debug('Session Date: ' + sessionDate);
            System.debug('Start Time: ' + startTime);
            System.debug('End Time: ' + endTime);
            System.debug('Location: ' + location);
            System.debug('Max Attendees: ' + maxAttendees);
            System.debug('Instructor ID: ' + instructorId);
            System.debug('Session Link: ' + sessionLink);
            
            Training_Session__c session = new Training_Session__c(
                Training_Course__c = courseId,
                Session_Date__c = sessionDate,
                Start_Time__c = Time.newInstance(Integer.valueOf(startTime.split(':')[0]), Integer.valueOf(startTime.split(':')[1]), 0, 0),
                End_Time__c = Time.newInstance(Integer.valueOf(endTime.split(':')[0]), Integer.valueOf(endTime.split(':')[1]), 0, 0),
                Location__c = location,
                Max_Attendees__c = maxAttendees,
                Instructor__c = instructorId,
                Session_Link__c = sessionLink
            );
            
            insert session;
            System.debug('Session created successfully with ID: ' + session.Id);
            
            return 'SUCCESS';
        } catch (Exception e) {
            System.debug('Error creating session: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Error creating session: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static String registerForSession(String sessionId) {
        try {
            // Check if user is already registered
            List<Training_Attendance__c> existing = [
                SELECT Id FROM Training_Attendance__c 
                WHERE Training_Session__c = :sessionId AND CreatedById = :UserInfo.getUserId()
            ];
            
            if (!existing.isEmpty()) {
                return 'ALREADY_REGISTERED';
            }
            
            // Check if session is full
            Integer currentAttendees = getAttendeeCount(sessionId);
            Training_Session__c session = [SELECT Max_Attendees__c FROM Training_Session__c WHERE Id = :sessionId];
            
            if (currentAttendees >= session.Max_Attendees__c) {
                return 'SESSION_FULL';
            }
            
            Training_Attendance__c attendance = new Training_Attendance__c(
                Training_Session__c = sessionId,
                Attendance_Status__c = 'Registered'
            );
            insert attendance;
            return 'SUCCESS';
        } catch (Exception e) {
            throw new AuraHandledException('Error registering for session: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static String cancelRegistration(String sessionId) {
        try {
            List<Training_Attendance__c> attendance = [
                SELECT Id FROM Training_Attendance__c 
                WHERE Training_Session__c = :sessionId AND CreatedById = :UserInfo.getUserId()
            ];
            
            if (!attendance.isEmpty()) {
                delete attendance;
                return 'SUCCESS';
            }
            return 'NOT_REGISTERED';
        } catch (Exception e) {
            throw new AuraHandledException('Error canceling registration: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static List<SessionWithDetails> getAllSessions() {
        try {
            List<Training_Session__c> sessions = [
                SELECT Id, Name, Training_Course__c, Training_Course__r.Name, 
                       Training_Course__r.Course_Description__c, Training_Course__r.Duration_Hours__c,
                       Training_Course__r.Course_Category__c, Session_Date__c, Start_Time__c, 
                       End_Time__c, Location__c, Max_Attendees__c, Instructor__c, Instructor__r.Name, Session_Link__c
                FROM Training_Session__c 
                ORDER BY Session_Date__c DESC, Start_Time__c ASC
            ];
            
            List<SessionWithDetails> sessionDetails = new List<SessionWithDetails>();
            for (Training_Session__c session : sessions) {
                SessionWithDetails detail = new SessionWithDetails();
                detail.session = session;
                detail.attendeeCount = getAttendeeCount(session.Id);
                detail.isUserRegistered = isUserRegistered(session.Id, UserInfo.getUserId());
                
                // Handle null Max_Attendees__c
                Integer maxAttendees = session.Max_Attendees__c != null ? (Integer)session.Max_Attendees__c : 0;
                detail.spotsAvailable = maxAttendees - detail.attendeeCount;
                
                sessionDetails.add(detail);
            }
            
            return sessionDetails;
        } catch (Exception e) {
            System.debug('Error in getAllSessions: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Error retrieving all sessions: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static List<Training_Session__c> getBasicSessions() {
        try {
            System.debug('Getting basic sessions');
            List<Training_Session__c> sessions = [
                SELECT Id, Name, Session_Date__c, Location__c, Max_Attendees__c, Session_Link__c
                FROM Training_Session__c 
                WHERE Session_Date__c >= TODAY
                ORDER BY Session_Date__c ASC
                LIMIT 10
            ];
            System.debug('Found ' + sessions.size() + ' basic sessions');
            return sessions;
        } catch (Exception e) {
            System.debug('Error in getBasicSessions: ' + e.getMessage());
            throw new AuraHandledException('Error retrieving basic sessions: ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<User> getInstructors() {
        try {
            return [
                SELECT Id, Name, Email
                FROM User 
                WHERE IsActive = true AND Profile.Name LIKE '%Admin%'
                ORDER BY Name
            ];
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving instructors: ' + e.getMessage());
        }
    }
    
    private static Integer getAttendeeCount(String sessionId) {
        try {
            return [
                SELECT COUNT() 
                FROM Training_Attendance__c 
                WHERE Training_Session__c = :sessionId 
                AND Attendance_Status__c IN ('Registered', 'Attended')
            ];
        } catch (Exception e) {
            System.debug('Error getting attendee count for session ' + sessionId + ': ' + e.getMessage());
            return 0;
        }
    }
    
    private static Boolean isUserRegistered(String sessionId, String userId) {
        try {
            return [
                SELECT COUNT() 
                FROM Training_Attendance__c 
                WHERE Training_Session__c = :sessionId AND CreatedById = :userId
            ] > 0;
        } catch (Exception e) {
            System.debug('Error checking user registration for session ' + sessionId + ': ' + e.getMessage());
            return false;
        }
    }
    
    public class SessionWithDetails {
        @AuraEnabled public Training_Session__c session;
        @AuraEnabled public Integer attendeeCount;
        @AuraEnabled public Boolean isUserRegistered;
        @AuraEnabled public Integer spotsAvailable;
    }
} 