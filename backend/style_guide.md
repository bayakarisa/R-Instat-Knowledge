# R-Instat Dialog Development — Style Guide

Version: 1.0
Author: [Your Name]
Purpose: Reference rules for developing R-Instat dialogs in VB.NET.
         This file is the authoritative style source for any AI assistant
         that reviews or generates R-Instat dialog code.

--------------------------------------------------------------------------------
## HOW TO USE THIS FILE

When an AI assistant (local model or Gemini fallback) is asked to:
  - WRITE a new dialog,
  - REVIEW existing code,
  - SUGGEST improvements,

it MUST obey every rule in this file. When in doubt, follow the sections in
the order they appear: Dialog Structure → Lifecycle → Method Rules → Anti-patterns.

If a request cannot be answered using only this file and the retrieved code
examples, the assistant must say so explicitly and request additional context
before generating code.

--------------------------------------------------------------------------------
## 1. THE GOLDEN RULES (never break these)

1. Every dialog is a VB.NET class that inherits from Form.
2. Every dialog follows the SAME method order. Do not invent your own order.
3. InitialiseDialog() configures the UI ONLY. It never touches R syntax.
4. SetDefaults() creates R syntax ONLY. It never touches the UI.
5. Never build R code as a string. Always use RFunction / ROperator / RParameter.
6. Reset always recreates fresh syntax objects. Never reuse old ones.
7. Controls are linked to syntax ONLY through SetRCodeForControls().
8. Validation happens ONLY in TestOkEnabled(). Not in event handlers.
9. The Load event coordinates. It does not contain business logic.
10. Use constants instead of hard-coded strings ("Ascending" → strAscending).

--------------------------------------------------------------------------------
## 2. CLASS STRUCTURE (mandatory order)

Every dialog file MUST contain these sections in this exact order:

    Imports
    Public Class dlgXxx
        Inherits Form

        ' 1. State flags
        ' 2. Constants
        ' 3. R syntax objects
        ' 4. Collections (dictionaries)

        ' 5. Load event
        ' 6. InitialiseDialog()
        ' 7. SetDefaults()
        ' 8. SetRCodeForControls()
        ' 9. Validation methods (TestOkEnabled and helpers)
        ' 10. Event handlers
        ' 11. Helper methods
    End Class

Rationale: consistent order lets any contributor find any part of the dialog
in seconds. Never deviate.

--------------------------------------------------------------------------------
## 3. STATE VARIABLES

Required state flags (declared at the very top of the class):

    Private bFirstLoad As Boolean = True
    Private bRCodeSet  As Boolean = True
    Private bReset     As Boolean = True

Optionally, when needed:

    Private bResetSubdialog       As Boolean
    Private bUpdatingParameters   As Boolean

Rules:
  - State flags represent DIALOG STATE only. Never store business data in them.
  - bFirstLoad: True only on first open. Controls InitialiseDialog().
  - bReset: True when the dialog should be reset (first open, or Reset pressed).
  - bRCodeSet: guards against control-update recursion during binding.
  - Do NOT add new boolean flags unless a plain flag cannot express the state.
  - Never rename these — the framework relies on the exact names.

--------------------------------------------------------------------------------
## 4. CONSTANTS

All repeated string literals must be defined as constants near the top of
the class, BEFORE any R syntax objects.

Example:

    Private ReadOnly strAscending  As String = "Ascending"
    Private ReadOnly strDescending As String = "Descending"
    Private ReadOnly strNone       As String = "None"

Rules:
  - Any string used more than once must be a constant.
  - Constants are ReadOnly.
  - Name them with the str prefix for strings, int/number for numerics.
  - Centralise option lists (palettes, themes, methods) in dictionaries, not
    scattered literals.

--------------------------------------------------------------------------------
## 5. R SYNTAX OBJECTS

R-Instat represents R code as OBJECTS, never as text.

Three classes are used:

    RFunction   — represents a single R function call, e.g. mean(x = temp)
    ROperator   — represents an operator, e.g. +, %>%, |>
    RParameter  — represents one named argument inside a function

Declared at class level, e.g.:

    Private clsBaseOperator      As New ROperator
    Private clsRggplotFunction   As New RFunction
    Private clsGeomTileFunction  As New RFunction
    Private clsHeatmapAesFunction As New RFunction

Rules:
  - Declare every syntax object at class level. Never declare locally.
  - Use the cls prefix for class-type variables.
  - Every dialog that produces ggplot output starts from:
        clsBaseOperator (the + operator)
        clsRggplotFunction (ggplot)
        then one or more geom_* / theme_* / aes functions.
  - Syntax objects are recreated in SetDefaults(), NOT in InitialiseDialog().

--------------------------------------------------------------------------------
## 6. USER CONTROLS (UCR)

R-Instat dialogs use custom user controls, not raw WinForms controls.

Common controls:
    ucrSelector           — shows variables in the current data frame
    ucrReceiverSingle     — accepts one variable
    ucrReceiverMultiple   — accepts several variables
    ucrInputTextBox       — free text
    ucrInputComboBox      — dropdown
    ucrInputColour        — colour picker
    ucrNud               — numeric up/down
    ucrCheck              — boolean option
    ucrSave               — output/object name
    ucrButtons            — dialog action buttons (Ok, Reset, Help, ...)
    ucrBase               — base dialog controller (MUST be present)
    ucrPnl*               — panel grouping radio buttons

Rules:
  - Use ucr controls, never the built-in WinForms equivalents.
  - Radio button groups MUST be inside a ucrPnl panel.
  - Never wire Visible/Enabled toggles manually — use linked controls.

--------------------------------------------------------------------------------
## 7. DIALOG LIFECYCLE

The Load event must follow this EXACT structure:

    Private Sub dlgXxx_Load(sender As Object, e As EventArgs) Handles MyBase.Load
        If bFirstLoad Then
            InitializeDialog()
        End If
        If bReset Then
            SetDefaults()
        End If
        SetRCodeForControls(bReset)
        autoTranslate(Me)
        TestOkEnabled()
    End Sub

The order is critical:
  1. InitializeDialog()   — configure controls (once)
  2. SetDefaults()        — build fresh R syntax (every reset)
  3. SetRCodeForControls() — link controls to syntax
  4. autoTranslate()      — apply language strings
  5. TestOkEnabled()      — decide if OK button is enabled

Never reorder. Never put logic directly in the Load event.

--------------------------------------------------------------------------------
## 8. InitialiseDialog() — RULES

Purpose: configure the USER INTERFACE. Runs ONCE per dialog lifetime.

MUST DO:
  - Set ucrBase.iHelpTopicID
  - Set ucrBase.clsRsyntax.iCallType (graph / output / summary / no-output)
  - Set ucrBase.clsRsyntax.bExcludeAssignedFunctionOutput when relevant
  - Configure selectors (ucrSelector.*)
  - Configure receivers (SetParameter, SetParameterIsString,
        SetIncludedDataType, SetExcludedDataType, SetLinkedDisplayControl,
        SelectIfAutomatic)
  - Add radio buttons to panels (ucrPnl.AddRadioButton)
  - Configure input controls (dropdown items, defaults for display)
  - Configure checkboxes with their parameter names
  - Populate dictionaries for option lists
  - Add linked controls with AddToLinkedControls()
  - Add parameter conditions with AddParameterPresentCondition()
    or AddParameterValuesCondition()
  - Configure save controls (ucrSave)
  - Attach event handlers LAST

MUST NOT DO:
  - Create RFunction / ROperator / RParameter objects
  - Reset any default values
  - Execute R code
  - Perform validation
  - Contain business logic
  - Respond to user events
  - Recreate controls every time the dialog opens

Organise the method into clearly commented sections:
    ' --- Configure base dialog ---
    ' --- Configure panels ---
    ' --- Configure selectors ---
    ' --- Configure receivers ---
    ' --- Configure input controls ---
    ' --- Configure checkboxes ---
    ' --- Configure save controls ---
    ' --- Configure linked controls ---
    ' --- Configure validation ---

--------------------------------------------------------------------------------
## 9. SetDefaults() — RULES

Purpose: build the DEFAULT R SYNTAX. Runs on first open and on every Reset.

MUST DO:
  - Create NEW RFunction / ROperator / RParameter objects every time.
  - Set function names immediately after creation (SetRCommand).
  - Set operators (SetOperation) after creation.
  - Add default parameters.
  - Build nested syntax explicitly (aes(...) inside ggplot(...)).
  - Assign sensible default values (themes, palettes, positions, sizes).
  - Recreate save function objects.
  - Prepare syntax so SetRCodeForControls() can bind controls to it.

MUST NOT DO:
  - Create or configure controls (that belongs to InitialiseDialog)
  - Reuse syntax objects from a previous dialog session
  - Build R commands as plain text
  - Assign default values AFTER controls have been linked
  - Forget to recreate nested functions after Reset

Recommended order inside SetDefaults():

    ' --- Create operators ---
    ' --- Create primary functions ---
    ' --- Create nested functions ---
    ' --- Assign default parameters ---
    ' --- Create save functions ---
    ' --- Create helper functions ---
    ' --- Define default values ---
    ' --- Prepare for control binding ---

--------------------------------------------------------------------------------
## 10. SetRCodeForControls() — RULES

Purpose: bind UI controls to R syntax objects.

Called as:
    SetRCodeForControls(bReset)

Rules:
  - Do NOT call this before SetDefaults() has created the syntax.
  - Do NOT skip this — controls cannot update R code without it.
  - Do NOT duplicate the bindings in event handlers.
  - It runs on every dialog opening, so it must be safe to call repeatedly.

--------------------------------------------------------------------------------
## 11. VALIDATION — RULES

Validation lives ONLY in TestOkEnabled() and its helper methods.

Rules:
  - TestOkEnabled() is called at the END of the Load event.
  - TestOkEnabled() must be called again from every event handler that
    changes whether the dialog can execute (e.g. receiver contents change).
  - Typical checks:
        * required receivers contain variables
        * required text fields are not blank
        * ucrSave has a valid object name
        * numeric inputs are within range
        * mutually dependent options are consistent
  - If every rule passes:  ucrBase.okEnabled(True)
  - Otherwise:             ucrBase.okEnabled(False)
  - Never let the user execute an incomplete dialog.

--------------------------------------------------------------------------------
## 12. EVENT HANDLERS

Rules:
  - Name handlers after the control and the event:
        ucrReceiverX_ControlValueChanged
        ucrCheckAddLabels_Click
        ucrInputComboColour_ControlValueChanged
  - Keep handlers SHORT. If they exceed ~15 lines, extract a helper method.
  - The typical handler shape is:
        1. Adjust visibility / enable state of related controls
        2. Update R parameters if needed
        3. Call TestOkEnabled()
  - Never put lifecycle logic in a handler.
  - Never call InitialiseDialog or SetDefaults from a handler.

--------------------------------------------------------------------------------
## 13. LINKED CONTROLS

Prefer linked controls over manual visibility management.

Use:
    AddToLinkedControls(ucrControl, New String() {"condition"}, bVisible:=True)

Rules:
  - Use AddToLinkedControls() for show/hide behaviour.
  - Use parameter conditions (AddParameterPresentCondition,
    AddParameterValuesCondition) for R syntax changes.
  - Never wire manual ".Visible = True/False" logic across controls if a
    linked-control rule can express it.

--------------------------------------------------------------------------------
## 14. DICTIONARIES / OPTION LISTS

Store option lists in dictionaries, not scattered literals.

Example:
    Private dctThemeFunctions As New Dictionary(Of String, RFunction)

Use dictionaries for:
  - Themes
  - Colour palettes
  - Legend positions
  - Statistical methods
  - Ordering options

Benefits: centralised, readable, easy to localise, easy to reuse.

--------------------------------------------------------------------------------
## 15. COMMON MISTAKES (never do these)

    ❌ Performing control configuration inside SetDefaults()
    ❌ Creating RFunction objects inside InitialiseDialog()
    ❌ Reusing syntax objects across resets
    ❌ Linking controls BEFORE the syntax has been created
    ❌ Putting business logic inside the Load event
    ❌ Omitting TestOkEnabled() at the end of the Load sequence
    ❌ Building R commands as plain strings
    ❌ Hard-coding option strings (use constants or dictionaries)
    ❌ Manually toggling control visibility when linked controls exist
    ❌ Attaching event handlers before linked controls are configured

--------------------------------------------------------------------------------
## 16. NAMING CONVENTIONS

    Dialog class          dlgXxxPlot, dlgXxxTable, ...
    State flags           bFirstLoad, bReset, bRCodeSet, bResetSubdialog
    Constants             strAscending, intMaxPoints, ...
    Syntax objects        clsBaseOperator, clsRggplotFunction, ...
    Collections           dctThemeFunctions, dctPalettes, ...
    Receivers             ucrReceiverX, ucrReceiverY, ucrReceiverFill
    Inputs                ucrInputTitle, ucrInputComboColour
    Checkboxes            ucrCheckAddLabels, ucrCheckFlipCoordinates
    Panels                ucrPnlOptions, ucrPnlColour
    Save controls         ucrSaveGraph
    Event handlers        ucrXxx_ControlValueChanged, ucrXxx_Click
    Helpers               GetXxx, SetXxx, UpdateXxx, ClearXxx

--------------------------------------------------------------------------------
## 17. RESPONSE FORMAT FOR THE AI ASSISTANT

When asked to WRITE a dialog:
  1. List which controls are needed (ucrSelector, ucrReceiver..., ucrSave...)
  2. Provide the full class skeleton in the mandated order
  3. Mark each section with the comment headers from Sections 8 and 9
  4. Cite which retrieved file each pattern is based on (file:line)

When asked to REVIEW code:
  1. List violations of THIS style guide, with severity:
         [BLOCKER]  — breaks the framework (e.g. R syntax built as string)
         [MAJOR]    — breaks a lifecycle rule (e.g. UI logic in SetDefaults)
         [MINOR]    — naming, comments, dead code
  2. For each violation: cite the file:line, explain what rule it breaks,
     and show the corrected snippet.
  3. End with 1–3 SMART suggestions if a simpler or faster alternative exists.
     These must be concrete and justified — no generic advice.

When asked about something NOT in the repo:
  1. Say clearly: "No direct precedent in your R-Instat repo."
  2. State what additional information is needed.
  3. Only after receiving the missing info, propose an answer that STILL
     follows every rule in this file.

--------------------------------------------------------------------------------
## 18. ESCALATION TO ONLINE AI (Gemini)

The local assistant handles most requests from the R-Instat repository alone.

It must escalate to the online AI (Gemini) ONLY when:
  - The user explicitly asks for something the local repo has no example of
  - The local assistant cannot produce a valid answer after two attempts
  - The user requests a topic clearly outside R-Instat (e.g. general C#,
    general R, third-party libraries not used in the project)

When escalating, the local assistant MUST pass:
  - The user's original question
  - This entire style guide
  - The closest 3 retrieved code examples from the repo (if any)
  - A clear statement of what is missing locally

The Gemini response is then returned to the user, tagged as:
  [Answer from online fallback — verify against this style guide before use]

--------------------------------------------------------------------------------
## END OF STYLE GUIDE