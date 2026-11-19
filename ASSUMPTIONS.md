# Assumptions Register --- Veloxa CXO Cockpit

**Status:** Updated through Day 3\
**Date opened:** 16 November 2026, last updated 19 November 2026

This is a living register. Never delete an assumption that turns out to
be wrong. Change its status to `revised`, `confirmed` or `rejected`,
explain why, and add a new entry if a replacement assumption is needed.

Confidence means confidence in the *assumption*, not confidence that the
source itself is correct.

  ------------------------------------------------------------------------------------------------------------------------------------------------
  ID         Date       Assumption / provisional  Source basis                          Confidence             What would change my     Status
                        interpretation                                                                         mind                     
  ---------- ---------- ------------------------- ------------------------------------- ---------------------- ------------------------ ----------
  A-001      16 Nov     The 14 agents are the     Candidate Brief: "14 people across    High                   A later instruction or   Revised
             2026       employees in Engineering, engineering, finance, HR and                                 release explicitly       
                        Finance, People & Ops and marketing"; Employee_Master.xlsx                             identifies a different   
                        Marketing: 5 + 3 + 3 + 3. department/title rows.                                       14-person roster.        
                        CEO, Sales and Support                                                                                          
                        remain in the company                                                                                           
                        directory but are not                                                                                           
                        part of the initial 14.                                                                                         

  A-002      16 Nov     The Employee Master is    Employee_Master.xlsx; data-room       High                   A later HRMS export with Active
             2026       the strongest supplied    README describes HRMS exports but the                        a newer timestamp or     
                        source for employee IDs,  actual Keka/leave files are absent                           explicit correction.     
                        titles, department,       from this ZIP.                                                                        
                        manager, join date,                                                                                             
                        location and status. It                                                                                         
                        is not necessarily a                                                                                            
                        complete or perfectly                                                                                           
                        current HR record.                                                                                              

  A-003      16 Nov     The two board updates are Board_Update_Apr-Jun_2026.pdf, sent 8 Medium-High            Audited accounts,        Active
             2026       the strongest currently   Jul 2026;                                                    management accounts or a 
                        supplied sources for      Board_Update_Jul-Sep_2026.pdf, sent 6                        newer board pack with    
                        board-reported ARR, burn, Oct 2026.                                                    clear definitions.       
                        customer count, team size                                                                                       
                        and Atlas status. They                                                                                          
                        are not treated as                                                                                              
                        audited financial                                                                                               
                        statements.                                                                                                     

  A-004      16 Nov     The board's team-size     Both board updates;                   Medium                 A dated active-headcount Active
             2026       figure of 19 and the 19   Employee_Master.xlsx.                                        report or a corrected    
                        employee-master records                                                                employee roster.         
                        are consistent enough to                                                                                        
                        use "19 records /                                                                                               
                        board-reported team of                                                                                          
                        19" as the Day 1                                                                                                
                        baseline, not as proof                                                                                          
                        that all 19 were active                                                                                         
                        on every date.                                                                                                  

  A-005      16 Nov     The transcript phrase     T1_CEO_Kickoff_Call.docx; board       Medium                 Audio recording,         Active
             2026       "one-eighty, give or      updates; Employee_Master.xlsx.                               corrected transcript, or 
                        take" may refer to 180                                                                 explicit headcount       
                        people, while the                                                                      report.                  
                        auto-summary also says                                                                                          
                        "roughly eighteen                                                                                               
                        people". Neither                                                                                                
                        transcript interpretation                                                                                       
                        overrides the structured                                                                                        
                        headcount evidence.                                                                                             

  A-006      16 Nov     T1's ARR "forty-two       T1; board updates show ₹5.8 Cr and    High confidence that   Original audio, a        Active
             2026       crore, maybe forty-five"  ₹6.1 Cr for different periods.        it is unresolved; low  corrected transcript, or 
                        is likely a transcription                                       confidence in any      contemporaneous finance  
                        or speech-summary error,                                        correction.            report.                  
                        but the intended number                                                                                         
                        is unknown. Do not                                                                                              
                        convert it to ₹4.2/₹4.5                                                                                         
                        Cr or another figure.                                                                                           

  A-007      16 Nov     T2's "forty-eight" ARR at T2_CFO_Call.docx; board updates.      High confidence that   Original audio or a      Active
             2026       the start of the year may                                       it is unresolved.      source defining the unit 
                        have an omitted                                                                        and period.              
                        unit/decimal, but it must                                                                                       
                        remain literal and                                                                                              
                        unresolved.                                                                                                     

  A-008      16 Nov     T1's "two point two" burn T1; T2; both board updates;           High                   Original audio, complete Active
             2026       is unitless. T2           GL_Export_Apr-Sep_2026.xlsx.                                 management accounts,     
                        explicitly says ₹2.2--2.5                                                              cash-flow statement and  
                        lakh/month, but this                                                                   burn definition.         
                        conflicts materially with                                                                                       
                        board burn of ₹44--46                                                                                           
                        lakh/month and monthly                                                                                          
                        payroll of ₹31.75 lakh in                                                                                       
                        the ledger. Do not                                                                                              
                        silently reinterpret it.                                                                                        

  A-009      16 Nov     The 6 Oct board update is Board_Update_Jul-Sep_2026.pdf, sent 6 High for what the      Release notes,           Active
             2026       the latest supplied       Oct; earlier Apr-Jun board update; T1 board reported; not    deployment record,       
                        statement of Atlas        transcript.                           proof of actual        customer communication   
                        status: feature-complete,                                       release completion.    or later engineering     
                        final hardening, GA moved                                                              export.                  
                        after reliability work.                                                                                         

  A-010      16 Nov     The planned marketing     Board_Update_Jul-Sep_2026.pdf;        Medium                 Named departure          Active
             2026       departure in the Jul-Sep  Employee_Master.xlsx row VX013.                              confirmation or later HR 
                        board update is probably                                                               export.                  
                        Siddharth Mehta, whose                                                                                          
                        employee record shows                                                                                           
                        notice period and exit                                                                                          
                        date 31 Oct, but the                                                                                            
                        board update does not                                                                                           
                        name him.                                                                                                       

  A-011      16 Nov     Karthik ran February      Email `01.eml`, 28 Feb 2026; T2;      High                   Payroll approval log,    Active
             2026       payroll while Fatima was  payroll register.                                            reconciliation, or       
                        away and used the January                                                              documented control       
                        sheet plus a new joiner.                                                               procedure.               
                        This is a process                                                                                               
                        exception worth checking,                                                                                       
                        not evidence of                                                                                                 
                        misconduct.                                                                                                     

  A-012      16 Nov     Rahul's February payroll  Payroll_Register_Jan-Mar_2026.xlsx,   High that a            Payslip calculation,     Active
             2026       entry and first-payslip   VX018 Feb row; Employee_Master.xlsx,  discrepancy/question   attendance/payable-day   
                        query warrant review. The VX018; emails `02.eml` and `03.eml`.  exists; low on whether policy, payroll          
                        register shows 28 days                                          payment was incorrect. correction or Fatima's   
                        payable in February,                                                                   follow-up.               
                        while the Employee Master                                                                                       
                        lists a 3 Feb join date.                                                                                        
                        The email contains a                                                                                            
                        query but no resolution.                                                                                        

  A-013      16 Nov     The "Sapphire Events Pvt  GL_Export_Apr-Sep_2026.xlsx rows 22   Low                    GSTIN, invoice address,  Active
             2026       Ltd" and "Saphire Event   and 25.                                                      vendor master or bank    
                        Mgmt" ledger payees may                                                                details.                 
                        be the same vendor, but                                                                                         
                        spelling similarity is                                                                                          
                        insufficient to merge                                                                                           
                        them.                                                                                                           

  A-014      16 Nov     The marketing-spend       T2 CFO transcript; GL selected cost   High                   Budget-vs-actual sheet,  Active
             2026       mismatch is an unresolved centres; budget-vs-actual sheet                              marketing ledger mapping 
                        reconciliation issue; it  listed as an action item but not                             and finance              
                        does not establish        included.                                                    reconciliation.          
                        overspending or                                                                                                 
                        inaccurate reporting by                                                                                         
                        either person.                                                                                                  

  A-015      16 Nov     Day 1 source availability Release folder `Day1_Mon_16Nov`;      Medium                 Explicit release         Active
             2026       for the cockpit is 16 Nov Candidate Brief says source material                         timestamp or             
                        2026 (date precision)     is released over the first week.                             later-provided metadata. 
                        because this is the                                                                                             
                        release-pack date. This                                                                                         
                        is an ingestion                                                                                                 
                        convention, not the                                                                                             
                        original creation date of                                                                                       
                        every source.                                                                                                   

  A-016      16 Nov     Employee private-life     Candidate Brief: "Where the data is   High                   A later instruction      Active
             2026       details needed to make    silent (their lives, their private                           limiting or changing     
                        agents feel human may be  thoughts), invent it and log it as an                        persona invention.       
                        invented, but must be     assumption."                                                                          
                        explicitly labelled as                                                                                          
                        fictional assumptions and                                                                                       
                        kept separate from                                                                                              
                        company facts.                                                                                                  

  A-017      16 Nov     The supplied payroll      T2 CFO transcript explicitly says     High                   A later explicit,        Active
             2026       register is sensitive.    individual salaries must never show                          authorized policy        
                        The CEO-facing cockpit    up in anything Ananya sees, only                             change; absent that,     
                        may expose only approved  totals.                                                      retain restriction.      
                        aggregates, never                                                                                               
                        individual salary                                                                                               
                        amounts.                                                                                                        

  A-018      16 Nov     The Day 1 ZIP is not the  ZIP inventory; `data_room/README.txt` High                   A later release supplies Active
             2026       complete data room        lists sources that are not present.                          those missing exports.   
                        described in                                                                                                    
                        `data_room/README.txt`.                                                                                         
                        The absent HR,                                                                                                  
                        engineering and other                                                                                           
                        folders must not be                                                                                             
                        simulated or represented                                                                                        
                        as ingested.                                                                                                    

  A-019      16 Nov     The transcript's "Linear  T1 and T2; data-room README and       Medium-High            System export or         Active
             2026       / Jeera board", "Git      supplied Zoho ledger/pre-Keka payroll                        official product/vendor  
                        Hub", "Cult Amp", "Kayka" description.                                                 identifiers.             
                        and "Joho books" likely                                                                                         
                        refer to Linear/Jira,                                                                                           
                        GitHub, Culture Amp, Keka                                                                                       
                        and Zoho Books, but                                                                                             
                        normalized names should                                                                                         
                        be stored as candidate                                                                                          
                        aliases with transcript                                                                                         
                        wording preserved.                                                                                              

  A-020      16 Nov     "Vicky" in T2's action    T2 action item; Employee_Master.xlsx  Low-Medium             Email/calendar/action    Active
             2026       item may refer to Vikram  contains Vikram Menon.                                       owner mapping or audio   
                        Menon, but the transcript                                                              confirmation.            
                        does not establish that                                                                                         
                        identity.                                                                                                       
  ------------------------------------------------------------------------------------------------------------------------------------------------

## Revisions and additions --- 18 November 2026

Entries below follow the same rules as the table: nothing is deleted;
revised rows keep their original text above.

-   **A-001 --- Revised (18 Nov 2026).** The 14 personas are no longer the
    Engineering + Finance + People & Ops + Marketing employees. On the
    CEO's instruction, they are the 14 people (excluding the CEO and anyone
    who has left) with the most presence across released documents, with
    seniority as the tie-break (D-026). Result: Manoj Kumar and Imran
    Siddiqui are personas; Divya Reddy, Aisha Khan and Kavya Narayan are not.
-   **A-021 --- "Snehal" is Sneha Kulkarni.** *Basis:* T5 lists "Snehal on
    SRE and on-call"; the incident export and on-call rota use both "Sneha"
    and "Snehal"; the employee master has one SRE, Sneha Kulkarni. *Confidence:*
    High. *Would change my mind:* An HR or contractor record for a person
    called Snehal. *Status:* Active.
-   **A-022 --- "Pria" in T5 and `pnair@users.noreply.github.com` are Priya
    Nair.** *Basis:* T5 names "Pria (routing lead)"; Priya Nair is the Staff
    Engineer; the git log has `priya.n@veloxa.in` and `pnair@…` in the same
    repositories. *Confidence:* Medium-High. *Status:* Active.
-   **A-023 --- No CRO exists yet.** *Basis:* T6b says Marketing will report
    to "the new CRO"; no CRO appears in the employee master or any document.
    The change is recorded as tentative and not applied. *Would change my
    mind:* A CRO row in a newer HR export. *Status:* Active.
-   **A-024 --- Siddharth Mehta has left.** *Basis:* Employee master status
    "Notice period" with exit date 31 Oct 2026; today is 18 Nov 2026. He is
    shown as Exited and is not a chat persona. *Confidence:* High.
    *Status:* Active.
-   **A-025 --- Atlas GA is now 15 Dec 2026.** *Basis:* Jira export, version
    "Atlas GA": release date 2026-12-15, original 2026-09-15, changed
    2026-09-02 by "vikram". *Confidence:* Medium (a planning field, not a
    commitment). *Status:* Active.
-   **A-027 --- Persona presence misses name variants.** *Basis:* T4 refers
    to Aisha Khan as "Ayesha"; the presence count matches full name, first
    name and work email only, so she counted as 0 documents and was not
    selected. Persona selection is therefore provisional. *Would change my
    mind / fix:* Matching known aliases (A-021, A-022) when counting.
    *Status:* Active (known limitation).
-   **A-026 --- Leadership is not a team.** *Basis:* The only Leadership row
    is the CEO. Team counts, filters and the health check leave out any
    department made up only of the CEO. *Status:* Active.

## Additions --- 19 November 2026

-   **A-028 --- Priya Nair has resigned, last day about 19 Jan 2027.**
    *Basis:* CEO voice note T6d ("Pria resigned this morning. Notice period
    two months, I think"). Not in any HR record. Stored as CEO-reported.
    *Confidence:* High that she resigned; Low-Medium on the notice length.
    *Would change my mind:* An HR export or resignation letter. *Status:*
    Active.
-   **A-029 --- "PN" in the Jira export is Priya Nair.** *Basis:* Jira shows
    assignees as initials; PN's tickets are core engine, re-routing and
    hardening, matching Vikram's 2 Jun plan for Priya; no other employee
    has those initials. *Confidence:* High. *Status:* Active.
-   **A-030 --- No Slack or chat data exists in the packs.** *Basis:* No
    such files in Day 1--4. T6c's request could not be met from the records
    even if it were appropriate. *Status:* Active.

## Revision protocol

When evidence changes an assumption:

1.  Do not delete the original row.
2.  Change its status to `revised`, `confirmed` or `rejected`.
3.  Add the date and evidence reference that changed it.
4.  Add a new row if a replacement interpretation is needed.
5.  Keep the original rationale so a reviewer can see how the system's
    understanding evolved.
