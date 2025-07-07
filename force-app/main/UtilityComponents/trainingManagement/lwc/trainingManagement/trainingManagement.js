import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import getCourses from '@salesforce/apex/TrainingManagementController.getCourses';
import getUpcomingSessions from '@salesforce/apex/TrainingManagementController.getUpcomingSessions';
import getUserAttendance from '@salesforce/apex/TrainingManagementController.getUserAttendance';
import getInstructors from '@salesforce/apex/TrainingManagementController.getInstructors';
import createCourse from '@salesforce/apex/TrainingManagementController.createCourse';
import createSession from '@salesforce/apex/TrainingManagementController.createSession';
import registerForSession from '@salesforce/apex/TrainingManagementController.registerForSession';
import cancelRegistration from '@salesforce/apex/TrainingManagementController.cancelRegistration';
import getAllSessions from '@salesforce/apex/TrainingManagementController.getAllSessions';
import getBasicSessions from '@salesforce/apex/TrainingManagementController.getBasicSessions';

export default class TrainingManagement extends LightningElement {
    @track activeTab = 'courses';
    @track showCourseModal = false;
    @track showSessionModal = false;
    @track showCourseDetail = false;
    @track selectedCourse = null;
    @track isLoading = false;
    
    // Form fields
    @track newCourse = {
        name: '',
        description: '',
        hours: '',
        category: ''
    };
    
    @track newSession = {
        courseId: '',
        sessionDate: '',
        startTime: '',
        endTime: '',
        location: '',
        maxAttendees: '',
        instructorId: '',
        sessionLink: ''
    };
    
    // Data
    coursesResult;
    sessionsResult;
    attendanceResult;
    instructorsResult;
    
    // Category options
    categoryOptions = [
        { label: 'Ethics and Integrity', value: 'Ethics and Integrity' },
        { label: 'Investigation Techniques', value: 'Investigation Techniques' },
        { label: 'Legal and Regulatory Compliance', value: 'Legal and Regulatory Compliance' },
        { label: 'Data Analysis and Technology', value: 'Data Analysis and Technology' },
        { label: 'Communication and Reporting', value: 'Communication and Reporting' },
        { label: 'Leadership and Management', value: 'Leadership and Management' },
        { label: 'Professional Development', value: 'Professional Development' }
    ];
    
    @wire(getCourses)
    wiredCourses(result) {
        this.coursesResult = result;
    }
    
    // Remove @wire for sessions since it's no longer cacheable
    sessionsResult;
    
    connectedCallback() {
        this.loadSessions();
    }
    
    async loadSessions() {
        this.isLoading = true;
        try {
            console.log('Loading sessions...');
            const sessions = await getUpcomingSessions();
            console.log('Received sessions:', sessions);
            this.sessionsResult = { data: sessions };
        } catch (error) {
            console.error('Error loading sessions:', error);
            this.sessionsResult = { error: error, data: [] }; // Provide empty array as fallback
            this.showToast('Error', 'Failed to load sessions: ' + (error.body?.message || error.message), 'error');
        } finally {
            this.isLoading = false;
        }
    }
    
    @wire(getUserAttendance)
    wiredAttendance(result) {
        this.attendanceResult = result;
    }
    
    @wire(getInstructors)
    wiredInstructors(result) {
        this.instructorsResult = result;
    }
    
    get courses() {
        return this.coursesResult?.data || [];
    }
    
    get sessions() {
        const rawSessions = this.sessionsResult?.data || [];
        // Add null checks to prevent template errors
        return rawSessions.map(sessionDetail => ({
            ...sessionDetail,
            session: {
                ...sessionDetail.session,
                Training_Course__r: sessionDetail.session?.Training_Course__r || {},
                Instructor__r: sessionDetail.session?.Instructor__r || {}
            }
        }));
    }
    
    get attendance() {
        return this.attendanceResult?.data || [];
    }
    
    get instructors() {
        return this.instructorsResult?.data?.map(instructor => ({
            label: instructor.Name,
            value: instructor.Id
        })) || [];
    }
    
    get courseOptions() {
        return this.courses.map(course => ({
            label: course.Name,
            value: course.Id
        }));
    }
    
    get coursesTabClass() {
        return `tab-button ${this.activeTab === 'courses' ? 'active' : ''}`;
    }
    
    get sessionsTabClass() {
        return `tab-button ${this.activeTab === 'sessions' ? 'active' : ''}`;
    }
    
    get myTrainingTabClass() {
        return `tab-button ${this.activeTab === 'mytraining' ? 'active' : ''}`;
    }
    
    get showCourses() {
        return this.activeTab === 'courses';
    }
    
    get showSessions() {
        return this.activeTab === 'sessions';
    }
    
    get showMyTraining() {
        return this.activeTab === 'mytraining';
    }
    
    get showCoursesList() {
        return this.showCourses && !this.showCourseDetail;
    }
    
    get courseSessions() {
        if (!this.selectedCourse || !this.sessions) return [];
        return this.sessions.filter(sessionDetail => 
            sessionDetail?.session?.Training_Course__c === this.selectedCourse.Id
        );
    }
    
    handleTabClick(event) {
        this.activeTab = event.target.dataset.tab;
        this.showCourseDetail = false;
        this.selectedCourse = null;
    }
    
    handleCourseSelect(event) {
        const courseId = event.currentTarget.dataset.courseId;
        this.selectedCourse = this.courses.find(course => course.Id === courseId);
        this.showCourseDetail = true;
    }
    
    handleBackToCourses() {
        this.showCourseDetail = false;
        this.selectedCourse = null;
    }
    
    handleNewCourse() {
        this.showCourseModal = true;
        this.resetCourseForm();
    }
    
    handleNewSession() {
        this.showSessionModal = true;
        this.resetSessionForm();
        // Pre-select course if viewing course details
        if (this.selectedCourse) {
            this.newSession.courseId = this.selectedCourse.Id;
        }
    }
    
    handleCloseModal() {
        this.showCourseModal = false;
        this.showSessionModal = false;
    }
    
    handleCourseInputChange(event) {
        const field = event.target.dataset.field;
        this.newCourse[field] = event.target.value;
    }
    
    handleSessionInputChange(event) {
        const field = event.target.dataset.field;
        this.newSession[field] = event.target.value;
    }
    
    async handleSaveCourse() {
        if (!this.validateCourseForm()) return;
        
        this.isLoading = true;
        try {
            const result = await createCourse({
                name: this.newCourse.name,
                description: this.newCourse.description,
                hours: parseFloat(this.newCourse.hours),
                category: this.newCourse.category
            });
            
            if (result === 'SUCCESS') {
                this.showToast('Success', 'Course created successfully!', 'success');
                this.showCourseModal = false;
                this.refreshData();
            }
        } catch (error) {
            this.showToast('Error', error.body.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }
    
    async handleSaveSession() {
        if (!this.validateSessionForm()) return;
        
        this.isLoading = true;
        try {
            const result = await createSession({
                courseId: this.newSession.courseId,
                sessionDate: this.newSession.sessionDate,
                startTime: this.newSession.startTime,
                endTime: this.newSession.endTime,
                location: this.newSession.location,
                maxAttendees: parseInt(this.newSession.maxAttendees),
                instructorId: this.newSession.instructorId,
                sessionLink: this.newSession.sessionLink
            });
            
            if (result === 'SUCCESS') {
                this.showToast('Success', 'Session created successfully!', 'success');
                this.showSessionModal = false;
                this.refreshData();
            }
        } catch (error) {
            this.showToast('Error', error.body.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }
    
    async handleRegister(event) {
        const sessionId = event.target.dataset.sessionId;
        this.isLoading = true;
        
        try {
            const result = await registerForSession({ sessionId: sessionId });
            
            if (result === 'SUCCESS') {
                this.showToast('Success', 'Successfully registered for session!', 'success');
                this.refreshData();
            } else if (result === 'ALREADY_REGISTERED') {
                this.showToast('Info', 'You are already registered for this session.', 'info');
            } else if (result === 'SESSION_FULL') {
                this.showToast('Warning', 'This session is full.', 'warning');
            }
        } catch (error) {
            this.showToast('Error', error.body.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }
    
    async handleCancel(event) {
        const sessionId = event.target.dataset.sessionId;
        this.isLoading = true;
        
        try {
            const result = await cancelRegistration({ sessionId: sessionId });
            
            if (result === 'SUCCESS') {
                this.showToast('Success', 'Registration cancelled successfully!', 'success');
                this.refreshData();
            }
        } catch (error) {
            this.showToast('Error', error.body.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }
    
    validateCourseForm() {
        const form = this.template.querySelector('.course-form');
        return form.checkValidity();
    }
    
    validateSessionForm() {
        const form = this.template.querySelector('.session-form');
        return form.checkValidity();
    }
    
    resetCourseForm() {
        this.newCourse = {
            name: '',
            description: '',
            hours: '',
            category: ''
        };
    }
    
    resetSessionForm() {
        this.newSession = {
            courseId: '',
            sessionDate: '',
            startTime: '',
            endTime: '',
            location: '',
            maxAttendees: '',
            instructorId: '',
            sessionLink: ''
        };
    }
    
    refreshData() {
        refreshApex(this.coursesResult);
        this.loadSessions(); // Load sessions imperatively since it's not cacheable
        refreshApex(this.attendanceResult);
    }
    
    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(event);
    }
    
    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString();
    }
    
    getCategoryBadgeClass(category) {
        const categoryMap = {
            'Ethics and Integrity': 'badge-ethics',
            'Investigation Techniques': 'badge-investigation',
            'Legal and Regulatory Compliance': 'badge-legal',
            'Data Analysis and Technology': 'badge-data',
            'Communication and Reporting': 'badge-communication',
            'Leadership and Management': 'badge-leadership',
            'Professional Development': 'badge-development'
        };
        return `category-badge ${categoryMap[category] || 'badge-default'}`;
    }
    
    getStatusBadgeClass(status) {
        const statusMap = {
            'Registered': 'status-registered',
            'Attended': 'status-attended',
            'No Show': 'status-noshow',
            'Cancelled': 'status-cancelled'
        };
        return `status-badge ${statusMap[status] || 'status-default'}`;
    }
   
} 