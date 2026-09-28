# Integration Test Fixtures

These files provide stable assets for live pdfRest integration workflows and
manual examples. Existing local test assets remain unchanged.

`ps-joboptions/02-joboptions.joboptions` is a compact Adobe PDF settings example
for testing PostScript or EPS conversion. It targets PDF 1.6, keeps
page orientation, embeds available fonts, and compresses pages. It follows the
[Adobe PDF Creation Settings documentation](https://opensource.adobe.com/dc-acrobat-sdk-docs/library/pdfcreation/index.html).
The multipart live workflow uses it with the numbered PostScript fixture.

`ps-joboptions/01-postscript.ps` is a one-page US Letter PostScript file to
convert with `ps-joboptions/02-joboptions.joboptions`. The output should show a
heading, two lines of black text, and a blue bar with white text. Its numbered
name keeps it before the job options file when the multipart workflow reads
and aggregates both files.

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
