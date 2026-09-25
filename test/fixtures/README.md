# Integration Test Fixtures

These files support the live pdfRest integration workflows and preserve the
existing local test assets unchanged.

`zugferd/factur-x-minimum.xml` is the Factur-X MINIMUM invoice fixture from
the [factur-x project](https://github.com/akretion/factur-x/blob/master/tests/fixtures/xml/factur-x-minimum.xml).
Its redistribution terms are in `zugferd/LICENSE.txt`. The multipart live
workflow uses it to create a ZUGFeRD PDF and require validation status `VALID`.

The signing fixture deliberately omits `02-credential.pfx` and
`03-password.txt`. Generate those files for each test run with:

```bash
scripts/generate-test-signing-certificate.sh <output-directory>
```

Keep the generated certificate, private key, and password outside the
repository and delete the output directory after the test run.
