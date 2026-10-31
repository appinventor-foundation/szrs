// Copyright 2026 appinventor.org
// Released under the Apache License, Version 2.0
// http://www.apache.org/licenses/LICENSE-2.0

// What a failed form action sends back, shared by the server helper and the
// form components.
export type FormErrors = Record<string, string[] | undefined>;
export type FormValues = Record<string, string>;
